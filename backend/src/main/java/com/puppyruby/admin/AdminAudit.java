package com.puppyruby.admin;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "admin_audit")
public class AdminAudit {
    @Id @Column(length = 36) String id;
    @Column(nullable = false, length = 36) String actorId;
    @Column(nullable = false, length = 24) String targetType;
    @Column(nullable = false, length = 80) String targetId;
    @Column(nullable = false, length = 32) String action;
    @Column(nullable = false, length = 600) String reason;
    long createdAt;
    protected AdminAudit() {}
    AdminAudit(String actorId, String targetType, String targetId, String action, String reason) {
        this.id = UUID.randomUUID().toString(); this.actorId = actorId; this.targetType = targetType;
        this.targetId = targetId; this.action = action; this.reason = reason; this.createdAt = System.currentTimeMillis();
    }
}
