package com.puppyruby.walk;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;
import java.util.*;

interface WalkMutexRepository extends JpaRepository<WalkMutex, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from WalkMutex m where m.id = :id")
    Optional<WalkMutex> findLocked(@Param("id") String id);
}
interface SocialProfileRepository extends JpaRepository<SocialProfile, String> {
    Optional<SocialProfile> findByPlayerId(String playerId);
    List<SocialProfile> findByRoomId(String roomId);
    long countByRoomIdAndLastSeenGreaterThanEqual(String roomId, long lastSeen);
}
interface SocialRoomRepository extends JpaRepository<SocialRoom, String> {
    List<SocialRoom> findByClosedAtIsNullOrderByCreatedAtDescIdAsc(Pageable page);
    long countByClosedAtIsNull();
}
interface SocialMessageRepository extends JpaRepository<SocialMessage, String> {
    List<SocialMessage> findByRoomIdOrderByCreatedAtAscIdAsc(String roomId);
    List<SocialMessage> findByRoomIdAndHiddenAtIsNullOrderByCreatedAtAscIdAsc(String roomId, Pageable page);
    long countByRoomIdAndHiddenAtIsNull(String roomId);
    @Query("select count(m) from SocialMessage m where m.hiddenAt is null and m.roomId in (select r.id from SocialRoom r where r.closedAt is null)")
    long countVisible();
    Optional<SocialMessage> findByDedupeKey(String dedupeKey);
}
interface SocialFriendshipRepository extends JpaRepository<SocialFriendship, String> {}
