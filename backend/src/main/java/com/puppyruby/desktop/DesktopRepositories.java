package com.puppyruby.desktop;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;

interface DesktopMutexRepository extends JpaRepository<DesktopMutex, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from DesktopMutex m where m.id = :id")
    Optional<DesktopMutex> findLocked(@Param("id") String id);
}
interface DesktopPairingRepository extends JpaRepository<DesktopPairing, String> {
    List<DesktopPairing> findByPlayerId(String playerId);
}
interface DesktopDeviceRepository extends JpaRepository<DesktopDevice, String> {
    Optional<DesktopDevice> findByTokenHash(String tokenHash);
    List<DesktopDevice> findByPlayerIdOrderByCreatedAtDesc(String playerId);
}
interface DesktopReceiptRepository extends JpaRepository<DesktopReceipt, String> {}
