package com.puppyruby.admin;

import com.puppyruby.auth.Account;
import com.puppyruby.auth.AccountRepository;
import com.puppyruby.auth.AuthService;
import com.puppyruby.game.PlayerRepository;
import com.puppyruby.desktop.DesktopService;
import com.puppyruby.walk.WalkAdminService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class AdminService {
    private final AuthService auth;
    private final AccountRepository accounts;
    private final PlayerRepository players;
    private final WalkAdminService walk;
    private final AdminAuditRepository audits;
    private final EntityManager entities;
    private final DesktopService desktop;
    public AdminService(AuthService auth, AccountRepository accounts, PlayerRepository players,
                        WalkAdminService walk, AdminAuditRepository audits, EntityManager entities, DesktopService desktop) {
        this.auth = auth; this.accounts = accounts; this.players = players; this.walk = walk;
        this.audits = audits; this.entities = entities;
        this.desktop = desktop;
    }
    public record Overview(long members, long activeMembers, long suspendedMembers, long puppies, long rooms, long messages) {}
    public record Member(String id, String email, String displayName, Account.Role role, Account.Status status,
                         boolean emailVerified, long createdAt, int puppyCount) {}
    public record Members(List<Member> items, int page, int totalPages, long totalElements) {}
    public record Result(String message) {}

    @Transactional(readOnly = true)
    public Overview overview(String token) {
        auth.requireAdmin(token);
        long active = accounts.count((root, query, cb) -> cb.equal(root.get("status"), Account.Status.ACTIVE));
        long suspended = accounts.count((root, query, cb) -> cb.equal(root.get("status"), Account.Status.SUSPENDED));
        long puppies = ((Number) entities.createNativeQuery("select count(*) from puppies").getSingleResult()).longValue();
        var counts = walk.counts();
        return new Overview(accounts.count(), active, suspended, puppies, counts.rooms(), counts.messages());
    }

    @Transactional(readOnly = true)
    public Members members(String token, int page, String queryText) {
        auth.requireAdmin(token); page(page);
        String text = Objects.toString(queryText, "").strip();
        if (text.codePointCount(0, text.length()) > 100 || text.codePoints().anyMatch(Character::isISOControl))
            throw bad("검색어는 100자 이내로 입력해 주세요.");
        String pattern = "%" + text.toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        Specification<Account> matching = (root, query, cb) -> text.isEmpty() ? cb.conjunction()
            : cb.or(cb.like(cb.lower(root.get("email")), pattern, '!'), cb.like(cb.lower(root.get("displayName")), pattern, '!'));
        var result = accounts.findAll(matching, PageRequest.of(page, 30, Sort.by(Sort.Order.desc("createdAt"), Sort.Order.asc("id"))));
        var puppyCounts = players.findAllById(result.getContent().stream().map(Account::getPlayerId).toList()).stream()
            .collect(Collectors.toMap(player -> player.id, player -> player.puppies.size()));
        return new Members(result.map(account -> new Member(account.id, account.email, account.displayName, account.role,
            account.status, account.emailVerified, account.createdAt, puppyCounts.getOrDefault(account.playerId, 0))).getContent(),
            page, result.getTotalPages(), result.getTotalElements());
    }

    @Transactional
    public Result status(String token, String targetId, String status, String reason) {
        Account actor = auth.requireAdmin(token);
        String explanation = reason(reason);
        Account.Status next;
        try { next = Account.Status.valueOf(Objects.toString(status, "")); }
        catch (IllegalArgumentException error) { throw bad("회원 상태는 ACTIVE 또는 SUSPENDED를 선택해 주세요."); }
        // Match the authentication lock order (auth mutex, then account row).
        // Any later validation failure rolls session deletion back with this transaction.
        if (next == Account.Status.SUSPENDED) auth.revokeSessions(Objects.toString(targetId, ""));
        Account target = entities.find(Account.class, Objects.toString(targetId, ""), LockModeType.PESSIMISTIC_WRITE);
        if (target == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "회원을 찾을 수 없어요.");
        if (next == Account.Status.SUSPENDED && (target.id.equals(actor.id) || target.role == Account.Role.ADMIN))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "본인이나 다른 관리자는 이용 정지할 수 없어요.");
        target.status = next;
        accounts.save(target);
        if (next == Account.Status.SUSPENDED) {
            desktop.revokePlayerDevices(target.playerId);
        }
        audits.save(new AdminAudit(actor.id, "MEMBER", target.id, "MEMBER_" + next, explanation));
        return new Result(next == Account.Status.SUSPENDED ? "회원의 이용을 정지하고 로그인을 해제했어요." : "회원의 이용 정지를 해제했어요. 다시 로그인할 수 있어요.");
    }

    @Transactional(readOnly = true)
    public WalkAdminService.Items<WalkAdminService.Room> rooms(String token, int page) {
        auth.requireAdmin(token); page(page); return walk.rooms(page);
    }
    @Transactional(readOnly = true)
    public WalkAdminService.Items<WalkAdminService.Message> messages(String token, String roomId, int page) {
        auth.requireAdmin(token); page(page); return walk.messages(roomId, page);
    }
    @Transactional
    public Result closeRoom(String token, String roomId, String reason) {
        Account actor = auth.requireAdmin(token); String explanation = reason(reason);
        walk.closeRoom(roomId);
        audits.save(new AdminAudit(actor.id, "ROOM", roomId, "ROOM_CLOSE", explanation));
        return new Result("산책방을 닫았어요. 참여자는 로비로 돌아가요.");
    }
    @Transactional
    public Result hideMessage(String token, String messageId, String reason) {
        Account actor = auth.requireAdmin(token); String explanation = reason(reason);
        walk.hideMessage(messageId);
        audits.save(new AdminAudit(actor.id, "MESSAGE", messageId, "MESSAGE_HIDE", explanation));
        return new Result("메시지를 숨겼어요. 산책방에서 더 이상 표시되지 않아요.");
    }

    private static void page(int value) { if (value < 0 || value > 10_000) throw bad("페이지 번호를 확인해 주세요."); }
    private static String reason(String value) {
        String result = Objects.toString(value, "").strip();
        int length = result.codePointCount(0, result.length());
        if (length < 1 || length > 300 || result.codePoints().anyMatch(Character::isISOControl))
            throw bad("관리 사유를 1~300자로 입력해 주세요.");
        return result;
    }
    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
}
