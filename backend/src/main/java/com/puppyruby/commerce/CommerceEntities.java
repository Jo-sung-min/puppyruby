package com.puppyruby.commerce;

import jakarta.persistence.*;
import java.util.HashMap;
import java.util.Map;

@Entity @Table(name = "commerce_settings")
class CommerceSettings {
    static final String ID = "global";
    @Id @Column(length = 16) String id = ID;
    long revision;
    Long updatedAt;
    boolean salesEnabled;
    @Column(nullable = false, length = 32000) String productsJson = "{}";
    @Column(nullable = false, length = 32000) String weightsJson = "{}";
    @Version Long rowVersion;
}

@Entity @Table(name = "commerce_wallets")
class CommerceWallet {
    @Id @Column(length = 36) String accountId;
    long dog;
    long aura;
    long accessory;
    @ElementCollection
    @CollectionTable(name = "commerce_items", joinColumns = @JoinColumn(name = "account_id"))
    @MapKeyColumn(name = "item_key", length = 64)
    @Column(name = "quantity", nullable = false)
    Map<String, Long> items = new HashMap<>();
    @Version Long rowVersion;
    protected CommerceWallet() {}
    CommerceWallet(String accountId) { this.accountId = accountId; }
}

@Entity @Table(name = "commerce_ticket_ledger")
class TicketLedger {
    @Id @Column(length = 64) String id;
    @Column(nullable = false, length = 200) String operationId;
    @Column(nullable = false, length = 36) String accountId;
    @Column(nullable = false, length = 12) String action;
    @Column(nullable = false, length = 12) String kind;
    int quantity;
    long createdAt;
}

@Entity @Table(name = "commerce_draws", indexes = @Index(name = "commerce_draw_account", columnList = "accountId,createdAt"))
class CommerceDraw {
    @Id @Column(length = 36) String id;
    @Column(nullable = false, unique = true, length = 80) String requestKey;
    @Column(nullable = false, length = 36) String accountId;
    @Column(nullable = false, length = 12) String kind;
    @Column(nullable = false, length = 64) String entryId;
    @Column(nullable = false, length = 100) String label;
    @Column(nullable = false, length = 8) String grade;
    Integer breed;
    @Column(length = 40) String itemId;
    @Column(length = 36) String puppyId;
    long createdAt;
    long catalogRevision;
    boolean duplicate;
}
