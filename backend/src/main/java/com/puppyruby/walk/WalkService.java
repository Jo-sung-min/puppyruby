package com.puppyruby.walk;

import com.puppyruby.game.GameService;
import com.puppyruby.game.Puppy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class WalkService {
    static final long PRESENCE_MS = 60_000;
    static final long MESSAGE_MS = 1_000;
    static final long MOVE_MS = 150;
    private final WalkMutexRepository mutex;
    private final SocialProfileRepository profiles;
    private final SocialRoomRepository rooms;
    private final SocialMessageRepository messages;
    private final SocialFriendshipRepository friendships;
    private final GameService game;

    public WalkService(WalkMutexRepository mutex, SocialProfileRepository profiles, SocialRoomRepository rooms,
                       SocialMessageRepository messages, SocialFriendshipRepository friendships, GameService game) {
        this.mutex = mutex; this.profiles = profiles; this.rooms = rooms;
        this.messages = messages; this.friendships = friendships; this.game = game;
    }

    public record Profile(String id, String nickname, Integer age, String friendship, String realName, String photo) {}
    public record Me(String id, String nickname, Integer age, String friendship, String realName, String photo, boolean configured) {}
    public record Dog(String id, String name, int breed, String grade, String fur, String eyes, String accessory, String aura) {}
    public record Member(Profile profile, Dog puppy, double x, double y, long lastSeen) {}
    public record Message(String id, Profile author, String text, long createdAt, boolean system) {}
    public record RoomSummary(String id, String title, String description, String theme, int capacity, int memberCount,
                              Profile owner, long createdAt) {}
    public record Room(String id, String title, String description, String theme, int capacity, int memberCount,
                       Profile owner, long createdAt, List<Member> members, List<Message> messages) {}
    public record State(Me me, List<RoomSummary> rooms, Room room, List<Profile> friends, List<Profile> requests, long serverTime) {}
    public record Result(State state, String message) {}
    public record Action(String nickname, Integer age, String realName, String photo, String title, String description,
                         String theme, Integer capacity, String roomId, String text, String clientId,
                         Double x, Double y, String targetId) {}

    @Transactional
    public void initialize() {
        if (!mutex.existsById("walk")) mutex.saveAndFlush(new WalkMutex("walk"));
        mutex.findLocked("walk").orElseThrow();
        seed("official-meadow", "공식 · 햇살 잔디밭", "처음 만난 친구와 가볍게 인사하는 열린 산책방", "meadow");
        seed("official-sunset", "공식 · 노을 산책길", "따스한 노을 아래 도란도란 이야기해요", "sunset");
        seed("official-night", "공식 · 별빛 공원", "별이 빛나는 공원에서 천천히 쉬어 가요", "night");
    }

    private void seed(String id, String title, String description, String theme) {
        if (rooms.existsById(id)) return;
        var room = new SocialRoom(); room.id = id; room.title = title; room.description = description;
        room.theme = theme; room.capacity = 12; room.createdAt = System.currentTimeMillis(); rooms.save(room);
    }

    @Transactional
    public State state(String playerId) {
        lock(); long now = System.currentTimeMillis(); expire(now);
        SocialProfile self = actor(playerId, now);
        return view(self, now);
    }

    @Transactional
    public Result act(String playerId, String action, Action input) {
        if (input == null) throw bad("요청 내용을 확인해 주세요.");
        lock(); long now = System.currentTimeMillis(); expire(now);
        SocialProfile self = actor(playerId, now);
        String message;
        if (!action.equals("profile") && !action.equals("leave") && !self.configured)
            throw bad("산책에 사용할 공개 닉네임을 먼저 저장해 주세요.");
        switch (action) {
            case "profile" -> {
                self.nickname = text(input.nickname(), 1, 24, "닉네임은 1~24자로 적어 주세요.");
                if (input.age() != null && (input.age() < 1 || input.age() > 120)) throw bad("나이는 1~120 사이로 적거나 비워 주세요.");
                self.age = input.age();
                self.realName = optionalText(input.realName(), 40, "이름은 40자 이내로 적어 주세요.");
                self.photo = photo(input.photo()); self.configured = true;
                message = "산책 프로필을 저장했어요. 이름과 사진은 서로 수락한 친구에게만 보여요.";
            }
            case "create" -> {
                var room = new SocialRoom(); room.id = UUID.randomUUID().toString();
                room.title = text(input.title(), 1, 40, "방 이름은 1~40자로 적어 주세요.");
                room.description = Objects.toString(optionalText(input.description(), 120, "방 소개는 120자 이내로 적어 주세요."), "");
                if (!List.of("meadow", "sunset", "night").contains(Objects.toString(input.theme(), ""))) throw bad("산책 배경을 선택해 주세요.");
                if (input.capacity() == null || !List.of(4, 8, 12).contains(input.capacity())) throw bad("정원은 4명, 8명, 12명 중에서 선택해 주세요.");
                room.theme = input.theme(); room.capacity = input.capacity(); room.ownerId = self.id; room.createdAt = now;
                rooms.save(room); enter(self, room, now); message = "새 산책방을 열었어요. 친구를 기다려 볼까요?";
            }
            case "join" -> {
                SocialRoom room = room(input.roomId());
                if (!room.id.equals(self.roomId)) enter(self, room, now);
                message = room.title + "에 함께 산책하러 왔어요.";
            }
            case "leave" -> { self.roomId = null; message = "산책을 마치고 로비로 돌아왔어요."; }
            case "message" -> {
                SocialRoom room = currentRoom(self);
                String body = text(input.text(), 1, 500, "메시지는 1~500자로 적어 주세요.");
                String clientId = uuid(input.clientId(), "메시지 전송 정보를 확인해 주세요.");
                String dedupe = self.id + ":" + clientId;
                var existing = messages.findByDedupeKey(dedupe);
                if (existing.isPresent()) {
                    if (!existing.get().roomId.equals(room.id) || !existing.get().text.equals(body)) throw bad("이미 사용한 메시지 전송 정보예요.");
                    message = "메시지를 보냈어요.";
                } else {
                    throttle(self.lastMessage, now, MESSAGE_MS, "메시지는 1초 간격으로 보내 주세요.");
                    var chat = new SocialMessage(); chat.id = UUID.randomUUID().toString(); chat.roomId = room.id;
                    chat.authorId = self.id; chat.dedupeKey = dedupe; chat.text = body; chat.createdAt = now;
                    messages.save(chat); self.lastMessage = now;
                    var history = messages.findByRoomIdOrderByCreatedAtAscIdAsc(room.id);
                    if (history.size() > 100) messages.deleteAll(history.subList(0, history.size() - 100));
                    message = "메시지를 보냈어요.";
                }
            }
            case "move" -> {
                currentRoom(self);
                if (input.x() == null || input.y() == null || !Double.isFinite(input.x()) || !Double.isFinite(input.y())
                    || input.x() < 8 || input.x() > 92 || input.y() < 18 || input.y() > 82) throw bad("산책길 안의 위치를 선택해 주세요.");
                throttle(self.lastMove, now, MOVE_MS, "조금 천천히 움직여 주세요.");
                self.x = input.x(); self.y = input.y(); self.lastMove = now; message = "강아지가 산책길을 따라 움직였어요.";
            }
            case "friend-request", "friend-accept", "friend-decline", "friend-remove" -> {
                SocialProfile target = profiles.findById(Objects.toString(input.targetId(), "")).orElseThrow(() -> bad("친구 정보를 찾을 수 없어요."));
                if (target.id.equals(self.id) || !target.configured) throw bad("친구를 다시 선택해 주세요.");
                String friendshipId = friendshipId(self.id, target.id);
                var existing = friendships.findById(friendshipId);
                switch (action) {
                    case "friend-request" -> {
                        if (existing.isPresent()) throw bad(existing.get().accepted ? "이미 서로 친구예요." : "이미 친구 요청이 있어요. 받은 요청을 확인해 주세요.");
                        var friendship = new SocialFriendship(); friendship.id = friendshipId;
                        friendship.requesterId = self.id; friendship.recipientId = target.id; friendship.createdAt = now;
                        friendships.save(friendship); message = "친구 요청을 보냈어요. 상대가 수락하면 이름과 사진이 서로 보여요.";
                    }
                    case "friend-accept", "friend-decline" -> {
                        var friendship = existing.orElseThrow(() -> bad("받은 친구 요청이 없어요."));
                        if (friendship.accepted || !friendship.recipientId.equals(self.id)) throw bad("내가 받은 친구 요청만 처리할 수 있어요.");
                        if (action.equals("friend-accept")) { friendship.accepted = true; message = "서로 친구가 되었어요! 이제 이름과 사진을 볼 수 있어요."; }
                        else { friendships.delete(friendship); message = "친구 요청을 정중히 거절했어요."; }
                    }
                    default -> {
                        var friendship = existing.orElseThrow(() -> bad("등록된 친구가 아니에요."));
                        if (!friendship.accepted) throw bad("등록된 친구가 아니에요.");
                        friendships.delete(friendship); message = "친구 관계를 해제했어요. 이름과 사진도 다시 숨겨져요.";
                    }
                }
            }
            default -> throw bad("지원하지 않는 산책 동작이에요.");
        }
        profiles.save(self);
        return new Result(view(self, now), message);
    }

    private void lock() { mutex.findLocked("walk").orElseThrow(() -> new IllegalStateException("산책방 초기화가 필요합니다.")); }

    private void expire(long now) {
        for (SocialProfile profile : profiles.findAll()) {
            if (profile.roomId != null && now - profile.lastSeen > PRESENCE_MS) profile.roomId = null;
        }
    }

    private SocialProfile actor(String playerId, long now) {
        var state = game.state(playerId);
        Puppy dog = state.puppies().stream().filter(p -> p.id.equals(state.selectedId())).findFirst().orElse(state.puppies().getFirst());
        SocialProfile self = profiles.findByPlayerId(playerId).orElseGet(() -> {
            var profile = new SocialProfile(); profile.id = UUID.randomUUID().toString(); profile.playerId = playerId;
            profile.nickname = dog.name + "엄마"; return profiles.save(profile);
        });
        self.lastSeen = now; self.puppyId = dog.id; self.puppyName = dog.name; self.puppyBreed = dog.breed;
        self.puppyGrade = dog.grade.name(); self.puppyFur = dog.fur; self.puppyEyes = dog.eyes; self.puppyAccessory = dog.accessory; self.puppyAura = dog.aura;
        return self;
    }

    private void enter(SocialProfile self, SocialRoom room, long now) {
        long members = profiles.findAll().stream().filter(p -> room.id.equals(p.roomId)).count();
        if (members >= room.capacity) throw bad("산책방이 가득 찼어요. 다른 방에서 만나요.");
        self.roomId = room.id; self.joinedAt = now; self.lastSeen = now;
        self.x = 20 + (members % 4) * 20; self.y = 42 + (members / 4) * 13; self.lastMove = 0;
    }

    private SocialRoom room(String id) { return rooms.findById(Objects.toString(id, "")).filter(r -> r.closedAt == null).orElseThrow(() -> bad("산책방을 찾을 수 없거나 운영자가 닫은 방이에요.")); }
    private SocialRoom currentRoom(SocialProfile self) {
        if (self.roomId == null) throw bad("산책방에 먼저 입장해 주세요.");
        return room(self.roomId);
    }

    private State view(SocialProfile self, long now) {
        var allProfiles = profiles.findAll().stream().collect(Collectors.toMap(p -> p.id, Function.identity()));
        var relations = friendships.findAll().stream().filter(f -> f.requesterId.equals(self.id) || f.recipientId.equals(self.id))
            .collect(Collectors.toMap(f -> f.requesterId.equals(self.id) ? f.recipientId : f.requesterId, Function.identity()));
        Function<SocialProfile, Profile> visible = profile -> {
            if (profile == null) return null;
            SocialFriendship relationship = relations.get(profile.id);
            String status = self.id.equals(profile.id) ? "self" : relationship == null ? "none" : relationship.accepted ? "friend"
                : relationship.requesterId.equals(self.id) ? "outgoing" : "incoming";
            boolean privateVisible = status.equals("self") || status.equals("friend");
            return new Profile(profile.id, profile.nickname, profile.age, status,
                privateVisible ? profile.realName : null, privateVisible ? profile.photo : null);
        };
        var summaries = new ArrayList<RoomSummary>(); Room current = null;
        var orderedRooms = rooms.findAll().stream().filter(r -> r.closedAt == null).sorted(Comparator.comparingLong((SocialRoom r) -> r.createdAt).thenComparing(r -> r.id)).toList();
        for (SocialRoom room : orderedRooms) {
            var occupants = allProfiles.values().stream().filter(p -> room.id.equals(p.roomId))
                .sorted(Comparator.comparingLong((SocialProfile p) -> p.joinedAt).thenComparing(p -> p.id)).toList();
            Profile owner = visible.apply(allProfiles.get(room.ownerId));
            summaries.add(new RoomSummary(room.id, room.title, room.description, room.theme, room.capacity, occupants.size(), owner, room.createdAt));
            if (room.id.equals(self.roomId)) {
                var members = occupants.stream().map(p -> new Member(visible.apply(p),
                    new Dog(p.puppyId, p.puppyName, p.puppyBreed, p.puppyGrade, p.puppyFur, p.puppyEyes, p.puppyAccessory, p.puppyAura), p.x, p.y, p.lastSeen)).toList();
                var history = messages.findByRoomIdOrderByCreatedAtAscIdAsc(room.id).stream()
                    .filter(m -> m.hiddenAt == null)
                    .map(m -> new Message(m.id, visible.apply(allProfiles.get(m.authorId)), m.text, m.createdAt, false)).toList();
                current = new Room(room.id, room.title, room.description, room.theme, room.capacity, occupants.size(), owner, room.createdAt, members, history);
            }
        }
        var friends = relations.entrySet().stream().filter(e -> e.getValue().accepted).map(e -> visible.apply(allProfiles.get(e.getKey())))
            .filter(Objects::nonNull).sorted(Comparator.comparing(Profile::nickname).thenComparing(Profile::id)).toList();
        var requests = relations.entrySet().stream().filter(e -> !e.getValue().accepted && e.getValue().recipientId.equals(self.id))
            .sorted(Comparator.comparingLong(e -> e.getValue().createdAt)).map(e -> visible.apply(allProfiles.get(e.getKey()))).filter(Objects::nonNull).toList();
        return new State(new Me(self.id, self.nickname, self.age, "self", self.realName, self.photo, self.configured), summaries, current, friends, requests, now);
    }

    private static String friendshipId(String first, String second) { return first.compareTo(second) < 0 ? first + ":" + second : second + ":" + first; }
    private static String uuid(String value, String message) {
        try { return UUID.fromString(value).toString(); } catch (RuntimeException error) { throw bad(message); }
    }
    private static String text(String value, int min, int max, String message) {
        String result = Objects.toString(value, "").strip();
        if (result.codePointCount(0, result.length()) < min || result.codePointCount(0, result.length()) > max
            || result.codePoints().anyMatch(c -> Character.isISOControl(c) && c != '\n')) throw bad(message);
        return result;
    }
    private static String optionalText(String value, int max, String message) {
        String result = text(value, 0, max, message); return result.isEmpty() ? null : result;
    }
    private static String photo(String value) {
        if (value == null || value.isBlank()) return null;
        if (value.length() > 200_000 || !value.matches("^data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$"))
            throw bad("사진은 작은 JPG·PNG·WebP 이미지로 올려 주세요.");
        int comma = value.indexOf(','); byte[] bytes;
        try { bytes = Base64.getDecoder().decode(value.substring(comma + 1)); }
        catch (IllegalArgumentException error) { throw bad("사진 파일을 읽을 수 없어요."); }
        if (bytes.length > 160 * 1024) throw bad("사진은 160KB 이하로 올려 주세요.");
        boolean jpeg = bytes.length >= 3 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255;
        boolean png = bytes.length >= 8 && Arrays.equals(Arrays.copyOf(bytes, 8), new byte[] {(byte)137, 80, 78, 71, 13, 10, 26, 10});
        boolean webp = bytes.length >= 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
            && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P';
        if (!(value.startsWith("data:image/jpeg;") && jpeg || value.startsWith("data:image/png;") && png || value.startsWith("data:image/webp;") && webp))
            throw bad("JPG·PNG·WebP 사진 파일인지 확인해 주세요.");
        if (!WalkPhoto.valid(bytes, webp)) throw bad("사진을 읽을 수 없어요. 가로·세로 1,024px 이하의 JPG·PNG·WebP 사진을 올려 주세요.");
        return value;
    }
    private static void throttle(long previous, long now, long interval, String message) {
        if (now - previous < interval) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, message);
    }
    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
}
