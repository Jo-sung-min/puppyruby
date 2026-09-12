package com.puppyruby.desktop;

import com.puppyruby.game.GameService;
import com.puppyruby.auth.AuthService;
import com.puppyruby.game.Puppy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.*;

@Service
public class DesktopService {
    static final long PAIRING_MS = 5 * 60_000;
    static final int MAX_DEVICES = 5;
    private static final String ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private static final Set<String> ACTIONS = Set.of("feed", "play", "rest", "train", "promote", "ask");
    private final DesktopMutexRepository mutex;
    private final DesktopPairingRepository pairings;
    private final DesktopDeviceRepository devices;
    private final DesktopReceiptRepository receipts;
    private final PairingRateLimiter limiter;
    private final GameService game;
    private final AuthService auth;
    private final SecureRandom random = new SecureRandom();

    public DesktopService(DesktopMutexRepository mutex, DesktopPairingRepository pairings, DesktopDeviceRepository devices,
                          DesktopReceiptRepository receipts, PairingRateLimiter limiter, GameService game, AuthService auth) {
        this.mutex = mutex; this.pairings = pairings; this.devices = devices;
        this.receipts = receipts; this.limiter = limiter; this.game = game; this.auth = auth;
    }

    public record Device(String id, String label, long createdAt, long lastSeen) {}
    public record Links(List<Device> devices) {}
    public record PairCode(String code, long expiresAt) {}
    public record Dog(String id, String name, int breed, String grade, int xp, int hunger, int happiness, int energy,
                      String fur, String eyes, String accessory, long lastFeed, long lastPlay, long lastRest, long lastTrain) {}
    public record State(Dog puppy, int coins, int promotionXp, int obedience, long syncedAt) {}
    public record PairResult(String token, Device device, State state) {}
    public record Result(State state, boolean success, String message) {}
    public record PairInput(String code, String deviceName) {}
    public record RevokeInput(String deviceId) {}
    public record Action(String action, String puppyId, String value, String requestId) {}

    @Transactional
    public void initialize() {
        if (!mutex.existsById("desktop")) mutex.saveAndFlush(new DesktopMutex("desktop"));
    }

    @Transactional
    public Links links(String playerId) {
        lock(); game.state(playerId);
        return linksFor(playerId);
    }

    @Transactional
    public PairCode pairCode(String playerId) {
        lock(); game.state(playerId);
        if (activeDevices(playerId).size() >= MAX_DEVICES) throw conflict("기기는 최대 5대까지 연결할 수 있어요. 사용하지 않는 기기의 연결을 먼저 해제해 주세요.");
        pairings.deleteAll(pairings.findByPlayerId(playerId));
        String code;
        do {
            var builder = new StringBuilder(12);
            for (int index = 0; index < 12; index++) builder.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
            code = builder.toString();
        } while (pairings.existsById(hash(code)));
        long now = System.currentTimeMillis();
        var pairing = new DesktopPairing(); pairing.codeHash = hash(code); pairing.playerId = playerId;
        pairing.createdAt = now; pairing.expiresAt = now + PAIRING_MS; pairings.save(pairing);
        return new PairCode(code.substring(0, 4) + "-" + code.substring(4, 8) + "-" + code.substring(8), pairing.expiresAt);
    }

    @Transactional
    public PairResult pair(PairInput input) {
        lock(); long now = System.currentTimeMillis();
        String code = input == null ? "" : normalizeCode(input.code());
        boolean validFormat = code.matches("[0-9A-HJKMNP-TV-Z]{12}");
        // A reverse proxy has one remote IP for all devices. Isolate guesses by their 20-bit code prefix instead.
        String attemptKey = hash(validFormat ? "prefix:" + code.substring(0, 4) : "malformed-code");
        limiter.check(attemptKey, now);
        var candidate = validFormat ? pairings.findById(hash(code)) : Optional.<DesktopPairing>empty();
        if (candidate.isEmpty() || candidate.get().consumedAt != null || candidate.get().expiresAt <= now) {
            limiter.failed(attemptKey, now);
            throw bad("연결 코드가 맞지 않거나 만료되었어요. 웹에서 새 코드를 발급해 주세요.");
        }
        DesktopPairing pairing = candidate.get();
        auth.assertPlayerActive(pairing.playerId);
        if (activeDevices(pairing.playerId).size() >= MAX_DEVICES) throw conflict("기기는 최대 5대까지 연결할 수 있어요. 웹에서 사용하지 않는 기기의 연결을 해제해 주세요.");
        String label = Objects.toString(input.deviceName(), "내 컴퓨터").strip();
        if (label.isEmpty() || label.codePointCount(0, label.length()) > 40 || label.codePoints().anyMatch(Character::isISOControl))
            throw bad("기기 이름은 1~40자로 적어 주세요.");
        byte[] secret = new byte[32]; random.nextBytes(secret);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
        var device = new DesktopDevice(); device.id = UUID.randomUUID().toString(); device.playerId = pairing.playerId;
        device.name = label; device.tokenHash = hash(token); device.createdAt = now; device.lastSeen = now;
        devices.save(device); pairing.consumedAt = now;
        return new PairResult(token, deviceView(device), view(game.state(device.playerId), now));
    }

    @Transactional
    public Links revoke(String playerId, RevokeInput input) {
        lock(); game.state(playerId);
        String deviceId = input == null ? "" : Objects.toString(input.deviceId(), "");
        var device = devices.findById(deviceId).filter(d -> d.playerId.equals(playerId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "연결된 기기를 찾을 수 없어요."));
        if (device.revokedAt == null) device.revokedAt = System.currentTimeMillis();
        return linksFor(playerId);
    }

    @Transactional
    public State state(String token) {
        lock(); DesktopDevice device = authenticated(token); long now = System.currentTimeMillis(); device.lastSeen = now;
        return view(game.state(device.playerId), now);
    }

    @Transactional
    public Result act(String token, Action input) {
        lock(); DesktopDevice device = authenticated(token);
        if (input == null || !ACTIONS.contains(Objects.toString(input.action(), ""))) throw bad("이 기기에서 사용할 수 없는 강아지 동작이에요.");
        String requestId;
        try { requestId = UUID.fromString(input.requestId()).toString(); }
        catch (RuntimeException error) { throw bad("동작 요청 정보를 확인해 주세요."); }
        if (input.value() != null && input.value().length() > 500) throw bad("강아지에게 할 말을 500자 이내로 적어 주세요.");
        var current = game.state(device.playerId);
        if (!Objects.equals(current.selectedId(), input.puppyId()))
            throw conflict("웹에서 함께할 강아지가 바뀌었어요. 새 강아지를 불러온 뒤 다시 눌러 주세요.");
        String fingerprint = hash(input.action() + "\u0000" + input.puppyId() + "\u0000" + Objects.toString(input.value(), ""));
        String receiptId = device.id + ":" + requestId;
        var previous = receipts.findById(receiptId);
        long now = System.currentTimeMillis(); device.lastSeen = now;
        if (previous.isPresent()) {
            if (!previous.get().fingerprint.equals(fingerprint)) throw conflict("이미 다른 동작에 사용한 요청 정보예요.");
            return new Result(view(current, now), previous.get().success, previous.get().message);
        }
        var result = game.act(device.playerId, input.action(), new GameService.Action(input.puppyId(), input.value(), null, null, null));
        var receipt = new DesktopReceipt(); receipt.id = receiptId; receipt.deviceId = device.id; receipt.fingerprint = fingerprint;
        receipt.message = result.message(); receipt.success = result.success(); receipt.createdAt = now; receipts.save(receipt);
        return new Result(view(result.state(), now), result.success(), result.message());
    }

    private void lock() { mutex.findLocked("desktop").orElseThrow(() -> new IllegalStateException("기기 연결 초기화가 필요합니다.")); }
    private List<DesktopDevice> activeDevices(String playerId) {
        return devices.findByPlayerIdOrderByCreatedAtDesc(playerId).stream().filter(d -> d.revokedAt == null).toList();
    }
    private Links linksFor(String playerId) { return new Links(activeDevices(playerId).stream().map(DesktopService::deviceView).toList()); }
    private static Device deviceView(DesktopDevice device) { return new Device(device.id, device.name, device.createdAt, device.lastSeen); }
    private DesktopDevice authenticated(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) throw unauthorized();
        DesktopDevice device = devices.findByTokenHash(hash(token)).filter(d -> d.revokedAt == null).orElseThrow(DesktopService::unauthorized);
        auth.assertPlayerActive(device.playerId);
        return device;
    }

    @Transactional
    public void revokePlayerDevices(String playerId) {
        lock();
        long now = System.currentTimeMillis();
        for (DesktopDevice device : activeDevices(playerId)) device.revokedAt = now;
        pairings.deleteAll(pairings.findByPlayerId(playerId));
    }
    private static State view(GameService.State state, long now) {
        Puppy dog = state.puppies().stream().filter(p -> p.id.equals(state.selectedId())).findFirst().orElseThrow();
        return new State(new Dog(dog.id, dog.name, dog.breed, dog.grade.name(), dog.xp, dog.hunger, dog.happiness, dog.energy,
            dog.fur, dog.eyes, dog.accessory, dog.lastFeed, dog.lastPlay, dog.lastRest, dog.lastTrain),
            state.coins(), state.promotionXp(), dog.grade.obedience, now);
    }
    private static String normalizeCode(String value) { return Objects.toString(value, "").toUpperCase(Locale.ROOT).replaceAll("[\\s-]", ""); }
    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
    private static ResponseStatusException unauthorized() { return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "웹과의 연결이 해제되었어요. 새 연결 코드로 다시 연결해 주세요."); }
    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
