package com.puppyruby.walk;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Objects;

/** Internal moderation operations. HTTP access is authorized by AdminService. */
@Service
public class WalkAdminService {
    private final WalkMutexRepository mutex;
    private final SocialProfileRepository profiles;
    private final SocialRoomRepository rooms;
    private final SocialMessageRepository messages;

    public WalkAdminService(WalkMutexRepository mutex, SocialProfileRepository profiles,
                            SocialRoomRepository rooms, SocialMessageRepository messages) {
        this.mutex = mutex; this.profiles = profiles; this.rooms = rooms; this.messages = messages;
    }
    public record Counts(long rooms, long messages) {}
    public record Room(String id, String title, String ownerLabel, long memberCount, long messageCount, long createdAt) {}
    public record Message(String id, String authorLabel, String text, long createdAt) {}
    public record Items<T>(List<T> items, int page, long totalElements) {}

    @Transactional(readOnly = true)
    public Counts counts() { return new Counts(rooms.countByClosedAtIsNull(), messages.countVisible()); }

    @Transactional(readOnly = true)
    public Items<Room> rooms(int page) {
        long activeSince = System.currentTimeMillis() - WalkService.PRESENCE_MS;
        var items = rooms.findByClosedAtIsNullOrderByCreatedAtDescIdAsc(PageRequest.of(page, 50)).stream()
            .map(room -> new Room(room.id, room.title, room.ownerId == null ? "공식 산책방" : label(room.ownerId),
                profiles.countByRoomIdAndLastSeenGreaterThanEqual(room.id, activeSince),
                messages.countByRoomIdAndHiddenAtIsNull(room.id), room.createdAt)).toList();
        return new Items<>(items, page, rooms.countByClosedAtIsNull());
    }

    @Transactional(readOnly = true)
    public Items<Message> messages(String roomId, int page) {
        room(roomId);
        var items = messages.findByRoomIdAndHiddenAtIsNullOrderByCreatedAtAscIdAsc(roomId, PageRequest.of(page, 100)).stream()
            .map(message -> new Message(message.id, label(message.authorId), message.text, message.createdAt)).toList();
        return new Items<>(items, page, messages.countByRoomIdAndHiddenAtIsNull(roomId));
    }

    @Transactional
    public void closeRoom(String roomId) {
        lock();
        SocialRoom room = room(roomId);
        if (room.closedAt != null) throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 닫힌 산책방이에요.");
        room.closedAt = System.currentTimeMillis();
        for (SocialProfile profile : profiles.findByRoomId(room.id)) profile.roomId = null;
    }

    @Transactional
    public void hideMessage(String messageId) {
        lock();
        SocialMessage message = messages.findById(Objects.toString(messageId, ""))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "메시지를 찾을 수 없어요."));
        if (message.hiddenAt != null) throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 숨긴 메시지예요.");
        message.hiddenAt = System.currentTimeMillis();
    }

    private SocialRoom room(String id) {
        return rooms.findById(Objects.toString(id, ""))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "산책방을 찾을 수 없어요."));
    }
    private String label(String profileId) { return profiles.findById(profileId).map(p -> p.nickname).orElse("산책 친구"); }
    private void lock() { mutex.findLocked("walk").orElseThrow(() -> new IllegalStateException("산책방 초기화가 필요합니다.")); }
}
