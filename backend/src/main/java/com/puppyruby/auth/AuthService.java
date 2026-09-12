package com.puppyruby.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;

@Service
public class AuthService {
    static final long SESSION_MS = 7L * 24 * 60 * 60_000;
    static final long VERIFY_MS = 24L * 60 * 60_000;
    static final long RESET_MS = 30 * 60_000;
    private static final String RESET_MESSAGE = "등록된 이메일이라면 비밀번호 재설정 안내를 보냈어요. 메일함을 확인해 주세요.";
    private final AccountRepository accounts;
    private final AuthSessionRepository sessions;
    private final AuthEmailTokenRepository emailTokens;
    private final AuthMutexRepository mutex;
    private final AuthRateLimiter limiter;
    private final AuthMailSender mail;
    private final KakaoClient kakao;
    private final ApplicationEventPublisher events;
    private final String site, adminEmail;
    private final SecureRandom random = new SecureRandom();
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
    private final String dummyHash = passwords.encode("dummy-login-password-with-no-account");

    public AuthService(AccountRepository accounts, AuthSessionRepository sessions, AuthEmailTokenRepository emailTokens,
                       AuthMutexRepository mutex, AuthRateLimiter limiter, AuthMailSender mail, KakaoClient kakao, ApplicationEventPublisher events,
                       @Value("${PUBLIC_SITE_URL:http://127.0.0.1:3000}") String site, @Value("${ADMIN_EMAIL:}") String adminEmail) {
        this.accounts = accounts; this.sessions = sessions; this.emailTokens = emailTokens; this.mutex = mutex;
        this.limiter = limiter; this.mail = mail; this.kakao = kakao; this.events = events;
        this.site = AuthSite.origin(site); this.adminEmail = adminEmail.strip().toLowerCase(Locale.ROOT);
    }
    public record User(String id, String email, String displayName, Account.Role role, Account.Status status,
                       boolean emailVerified, String provider, long createdAt) {}
    public record Config(boolean emailEnabled, boolean kakaoEnabled) {}
    public record Me(User user, Config config) {}
    public record AuthResult(User user, String token, long expiresAt, String message) {}
    public record ProfileResult(User user, String message) {}
    public record Message(String message) {}
    public record PasswordResult(String message, boolean logout) {}
    public record Register(String email, String password, String displayName) {}
    public record Login(String email, String password) {}
    public record Profile(String displayName) {}
    public record Password(String currentPassword, String newPassword) {}
    public record Email(String email) {}
    public record Token(String token) {}
    public record Reset(String token, String password) {}
    public record Kakao(String code, String redirectUri) {}

    @Transactional
    public void initialize() { if (!mutex.existsById("auth")) mutex.saveAndFlush(new AuthMutex("auth")); }

    @Transactional(readOnly = true)
    public Me me(String sessionToken) {
        return new Me(blank(sessionToken) ? null : view(requireAccount(sessionToken)), new Config(mail.enabled(), kakao.enabled()));
    }

    @Transactional
    public AuthResult register(String guestId, Register input) {
        if (input == null) throw bad("가입 정보를 입력해 주세요.");
        String email = email(input.email()), name = name(input.displayName()); validatePassword(input.password());
        limiter.take("register", guestKey(guestId), 5, 60);
        String encoded = passwords.encode(input.password());
        lock();
        if (accounts.findByEmail(email).isPresent()) throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 가입한 이메일이에요. 로그인하거나 비밀번호를 다시 설정해 주세요.");
        Account account = newAccount(guestId, name); account.email = email; account.passwordHash = encoded;
        accounts.saveAndFlush(account);
        return signIn(account, "가입했어요. 지금까지 함께한 강아지를 계속 돌볼 수 있어요.");
    }

    @Transactional
    public AuthResult login(Login input) {
        String email = input == null ? "" : loginEmail(input.email());
        limiter.take("login", email, 10, 400);
        String password = input == null ? null : input.password();
        lock();
        Account account = accounts.findByEmail(email).orElse(null);
        boolean usable = password != null && password.getBytes(StandardCharsets.UTF_8).length <= 72;
        boolean matches = passwords.matches(usable ? password : "", account == null || account.passwordHash == null ? dummyHash : account.passwordHash);
        if (account == null || account.passwordHash == null || !usable || !matches) throw unauthorized("이메일 또는 비밀번호를 확인해 주세요.");
        active(account); promoteConfiguredAdmin(account);
        return signIn(account, "다시 만나 반가워요!");
    }

    @Transactional
    public AuthResult kakao(String guestId, Kakao input) {
        limiter.take("kakao", guestKey(guestId), 10, 100);
        if (input == null) throw bad("카카오 로그인을 다시 시작해 주세요.");
        KakaoClient.Identity identity = kakao.exchange(input.code(), input.redirectUri());
        lock();
        Account account = accounts.findByKakaoId(identity.id()).orElse(null);
        if (account == null) {
            String nickname;
            try { nickname = name(identity.nickname()); } catch (ResponseStatusException invalid) { nickname = "카카오 친구"; }
            account = newAccount(guestId, nickname); account.kakaoId = identity.id();
            if (identity.emailVerified() && identity.email() != null) {
                try {
                    String email = email(identity.email());
                    // An email collision never links identities or transfers an existing account's puppy.
                    if (accounts.findByEmail(email).isEmpty()) { account.email = email; account.emailVerified = true; }
                } catch (ResponseStatusException ignored) { /* Email is an optional provider field. */ }
            }
            accounts.saveAndFlush(account);
        }
        active(account); promoteConfiguredAdmin(account);
        return signIn(account, "카카오 계정으로 로그인했어요.");
    }

    @Transactional
    public Message logout(String sessionToken) {
        lock(); if (validToken(sessionToken)) sessions.deleteById(hash(sessionToken));
        return new Message("로그아웃했어요.");
    }

    @Transactional
    public ProfileResult profile(String sessionToken, Profile input) {
        lock(); Account account = requireAccount(sessionToken);
        account.displayName = name(input == null ? null : input.displayName());
        accounts.save(account); return new ProfileResult(view(account), "이름을 저장했어요.");
    }

    @Transactional
    public PasswordResult password(String sessionToken, Password input) {
        lock(); Account account = requireAccount(sessionToken);
        limiter.take("password", account.id, 5, 200);
        if (account.passwordHash == null) throw bad("카카오 계정의 비밀번호는 카카오에서 변경해 주세요.");
        if (input == null || input.currentPassword() == null || input.currentPassword().getBytes(StandardCharsets.UTF_8).length > 72
            || !passwords.matches(input.currentPassword(), account.passwordHash)) throw bad("현재 비밀번호를 확인해 주세요.");
        validatePassword(input.newPassword());
        account.passwordHash = passwords.encode(input.newPassword()); accounts.save(account);
        sessions.deleteByAccountId(account.id); emailTokens.deleteByAccountIdAndKind(account.id, AuthEmailToken.Kind.RESET);
        events.publishEvent(new AccountCredentialsChanged(account.playerId));
        return new PasswordResult("비밀번호를 변경했어요. 새 비밀번호로 다시 로그인해 주세요.", true);
    }

    @Transactional
    public Message requestVerification(String sessionToken) {
        lock(); Account account = requireAccount(sessionToken);
        limiter.take("verify-mail", account.id, 3, 100);
        mail.requireEnabled();
        if (account.emailVerified) return new Message("이미 확인한 이메일이에요.");
        if (account.email == null) throw bad("확인할 이메일이 없는 계정이에요.");
        sendToken(account, AuthEmailToken.Kind.VERIFY);
        return new Message("인증 메일을 보냈어요. 메일함을 확인해 주세요.");
    }

    @Transactional
    public Message confirmVerification(Token input) {
        String token = input == null ? null : input.token();
        limiter.take("verify-token", tokenKey(token), 10, 200);
        lock(); AuthEmailToken record = emailToken(token, AuthEmailToken.Kind.VERIFY);
        Account account = accounts.findById(record.accountId).orElseThrow(() -> bad("인증 링크를 다시 요청해 주세요."));
        active(account); account.emailVerified = true; promoteConfiguredAdmin(account); accounts.save(account);
        emailTokens.deleteByAccountIdAndKind(account.id, AuthEmailToken.Kind.VERIFY);
        return new Message("이메일을 확인했어요.");
    }

    @Transactional
    public Message requestReset(Email input) {
        String email = input == null ? "" : loginEmail(input.email());
        limiter.take("reset-mail", email, 3, 100);
        mail.requireEnabled(); lock();
        Account account = accounts.findByEmail(email).orElse(null);
        if (account != null && account.status == Account.Status.ACTIVE && account.passwordHash != null) {
            try { sendToken(account, AuthEmailToken.Kind.RESET); }
            catch (ResponseStatusException deliveryFailure) {
                // A delivery outage must not disclose which addresses have accounts.
                emailTokens.deleteByAccountIdAndKind(account.id, AuthEmailToken.Kind.RESET);
            }
        }
        return new Message(RESET_MESSAGE);
    }

    @Transactional
    public Message confirmReset(Reset input) {
        String token = input == null ? null : input.token();
        limiter.take("reset-token", tokenKey(token), 10, 200);
        validatePassword(input == null ? null : input.password());
        lock(); AuthEmailToken record = emailToken(token, AuthEmailToken.Kind.RESET);
        Account account = accounts.findById(record.accountId).orElseThrow(() -> bad("재설정 링크를 다시 요청해 주세요."));
        active(account);
        if (account.passwordHash == null) throw bad("카카오 계정의 비밀번호는 카카오에서 변경해 주세요.");
        account.passwordHash = passwords.encode(input.password()); account.emailVerified = true;
        promoteConfiguredAdmin(account); accounts.save(account);
        sessions.deleteByAccountId(account.id); emailTokens.deleteByAccountId(account.id);
        events.publishEvent(new AccountCredentialsChanged(account.playerId));
        return new Message("비밀번호를 다시 설정했어요. 새 비밀번호로 로그인해 주세요.");
    }

    @Transactional(readOnly = true)
    public String resolvePlayer(String sessionToken, String guestId) {
        if (!blank(sessionToken)) return requireAccount(sessionToken).playerId;
        String player = guest(guestId);
        if (accounts.existsByPlayerId(player)) throw unauthorized("계정에 연결한 강아지예요. 로그인해 주세요.");
        return player;
    }

    @Transactional(readOnly = true)
    public Account requireAccount(String sessionToken) {
        if (!validToken(sessionToken)) throw unauthorized("로그인이 필요해요.");
        AuthSession session = sessions.findById(hash(sessionToken)).orElseThrow(() -> unauthorized("로그인이 만료되었어요. 다시 로그인해 주세요."));
        if (session.expiresAt <= System.currentTimeMillis()) throw unauthorized("로그인이 만료되었어요. 다시 로그인해 주세요.");
        Account account = accounts.findById(session.accountId).orElseThrow(() -> unauthorized("다시 로그인해 주세요."));
        active(account); return account;
    }

    @Transactional(readOnly = true)
    public Account requireAdmin(String sessionToken) {
        Account account = requireAccount(sessionToken);
        if (account.role != Account.Role.ADMIN || !account.emailVerified)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "관리자만 이용할 수 있어요.");
        return account;
    }

    @Transactional(readOnly = true)
    public void assertPlayerActive(String playerId) { accounts.findByPlayerId(playerId).ifPresent(AuthService::active); }

    @Transactional
    public void revokeSessions(String accountId) { lock(); sessions.deleteByAccountId(accountId); }

    private Account newAccount(String guestId, String name) {
        String player = blank(guestId) ? UUID.randomUUID().toString() : guest(guestId);
        if (accounts.existsByPlayerId(player)) player = UUID.randomUUID().toString();
        Account account = new Account(); account.id = UUID.randomUUID().toString(); account.playerId = player;
        account.displayName = name; account.createdAt = System.currentTimeMillis(); return account;
    }
    private AuthResult signIn(Account account, String message) {
        long now = System.currentTimeMillis();
        sessions.deleteByExpiresAtLessThanEqual(now); emailTokens.deleteByExpiresAtLessThanEqual(now);
        var existing = sessions.findByAccountIdOrderByCreatedAtDesc(account.id);
        if (existing.size() >= 10) sessions.deleteAll(existing.subList(9, existing.size()));
        String token = token(); AuthSession session = new AuthSession(); session.tokenHash = hash(token);
        session.accountId = account.id; session.createdAt = now; session.expiresAt = now + SESSION_MS; sessions.save(session);
        return new AuthResult(view(account), token, session.expiresAt, message);
    }
    private void sendToken(Account account, AuthEmailToken.Kind kind) {
        emailTokens.deleteByAccountIdAndKind(account.id, kind); emailTokens.flush();
        String token = token(); AuthEmailToken record = new AuthEmailToken(); record.tokenHash = hash(token);
        record.accountId = account.id; record.kind = kind; record.createdAt = System.currentTimeMillis();
        record.expiresAt = record.createdAt + (kind == AuthEmailToken.Kind.RESET ? RESET_MS : VERIFY_MS);
        emailTokens.saveAndFlush(record);
        mail.send(account.email, kind == AuthEmailToken.Kind.RESET, site + (kind == AuthEmailToken.Kind.RESET ? "/account/reset?token=" : "/account/verify?token=") + token);
    }
    private AuthEmailToken emailToken(String token, AuthEmailToken.Kind kind) {
        if (!validToken(token)) throw bad("링크가 올바르지 않거나 만료되었어요. 새 링크를 요청해 주세요.");
        AuthEmailToken record = emailTokens.findById(hash(token)).orElseThrow(() -> bad("링크가 올바르지 않거나 만료되었어요. 새 링크를 요청해 주세요."));
        if (record.kind != kind || record.expiresAt <= System.currentTimeMillis()) throw bad("링크가 올바르지 않거나 만료되었어요. 새 링크를 요청해 주세요.");
        return record;
    }
    private void promoteConfiguredAdmin(Account account) {
        if (!adminEmail.isBlank() && account.emailVerified && adminEmail.equals(account.email)) { account.role = Account.Role.ADMIN; accounts.save(account); }
    }
    public static User view(Account account) { return new User(account.id, account.email, account.displayName, account.role, account.status, account.emailVerified, account.kakaoId == null ? "EMAIL" : "KAKAO", account.createdAt); }
    private void lock() { mutex.lock().orElseThrow(() -> new IllegalStateException("Authentication is not initialized")); }
    private String token() { byte[] bytes = new byte[32]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private static String guestKey(String guestId) { return blank(guestId) ? "missing-guest" : guest(guestId); }
    private static String guest(String value) {
        if (value == null || !value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) throw bad("방문 정보를 다시 확인해 주세요.");
        return value.toLowerCase(Locale.ROOT);
    }
    private static String tokenKey(String token) { return validToken(token) ? token.substring(0, 8) : "invalid-token"; }
    private static boolean validToken(String token) { return token != null && token.matches("[A-Za-z0-9_-]{43}"); }
    private static boolean blank(String value) { return value == null || value.isBlank(); }
    private static String loginEmail(String value) { return value == null ? "" : value.length() > 254 ? "invalid-email" : value.strip().toLowerCase(Locale.ROOT); }
    private static String email(String value) {
        String normalized = loginEmail(value);
        if (value == null || value.length() > 254 || !normalized.matches("[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+")
            || normalized.indexOf('@') > 64) throw bad("이메일 주소를 확인해 주세요.");
        return normalized;
    }
    private static String name(String value) {
        String normalized = value == null ? "" : value.strip();
        if (normalized.isEmpty() || normalized.codePointCount(0, normalized.length()) > 40 || normalized.codePoints().anyMatch(Character::isISOControl))
            throw bad("이름은 줄바꿈 없이 1~40자로 입력해 주세요.");
        return normalized;
    }
    private static void validatePassword(String value) {
        if (value == null || value.codePointCount(0, value.length()) < 8 || value.getBytes(StandardCharsets.UTF_8).length > 72 || value.indexOf('\0') >= 0)
            throw bad("비밀번호는 8자 이상, UTF-8 기준 72바이트 이내로 입력해 주세요.");
    }
    private static void active(Account account) {
        if (account.status != Account.Status.ACTIVE) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "이용이 제한된 계정이에요. 운영자에게 문의해 주세요.");
    }
    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException unauthorized(String message) { return new ResponseStatusException(HttpStatus.UNAUTHORIZED, message); }
}
