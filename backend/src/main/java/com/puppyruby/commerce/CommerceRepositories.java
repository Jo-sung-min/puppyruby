package com.puppyruby.commerce;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import java.util.*;

interface CommerceSettingsRepository extends JpaRepository<CommerceSettings, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select settings from CommerceSettings settings where settings.id = 'global'")
    Optional<CommerceSettings> findLocked();
}
interface CommerceWalletRepository extends JpaRepository<CommerceWallet, String> {}
interface TicketLedgerRepository extends JpaRepository<TicketLedger, String> {}
interface CommerceDrawRepository extends JpaRepository<CommerceDraw, String> {
    Optional<CommerceDraw> findByRequestKey(String requestKey);
    List<CommerceDraw> findTop50ByAccountIdOrderByCreatedAtDescIdDesc(String accountId);
}
