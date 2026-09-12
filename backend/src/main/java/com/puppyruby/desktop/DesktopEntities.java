package com.puppyruby.desktop;

import jakarta.persistence.*;

@Entity @Table(name = "desktop_mutex")
class DesktopMutex {
    @Id String id;
    protected DesktopMutex() {}
    DesktopMutex(String id) { this.id = id; }
}

@Entity @Table(name = "desktop_pairings")
class DesktopPairing {
    @Id String codeHash;
    @Column(nullable = false) String playerId;
    long createdAt;
    long expiresAt;
    Long consumedAt;
}

@Entity @Table(name = "desktop_devices")
class DesktopDevice {
    @Id String id;
    @Column(nullable = false) String playerId;
    @Column(nullable = false, unique = true) String tokenHash;
    @Column(nullable = false, length = 80) String name;
    long createdAt;
    long lastSeen;
    Long revokedAt;
}

@Entity @Table(name = "desktop_receipts")
class DesktopReceipt {
    @Id String id;
    @Column(nullable = false) String deviceId;
    @Column(nullable = false) String fingerprint;
    @Column(nullable = false, length = 2000) String message;
    boolean success;
    long createdAt;
}
