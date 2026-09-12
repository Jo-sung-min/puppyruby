package com.puppyruby.auth;

import jakarta.persistence.*;

@Entity @Table(name = "auth_mutex")
class AuthMutex {
    @Id @Column(length = 16) String id;
    protected AuthMutex() {}
    AuthMutex(String id) { this.id = id; }
}

@Entity @Table(name = "auth_sessions", indexes = @Index(name = "auth_session_account", columnList = "accountId"))
class AuthSession {
    @Id @Column(length = 64) String tokenHash;
    @Column(nullable = false, length = 36) String accountId;
    long createdAt;
    long expiresAt;
}

@Entity @Table(name = "auth_email_tokens", indexes = @Index(name = "auth_email_account", columnList = "accountId"))
class AuthEmailToken {
    enum Kind { VERIFY, RESET }
    @Id @Column(length = 64) String tokenHash;
    @Column(nullable = false, length = 36) String accountId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10) Kind kind;
    long createdAt;
    long expiresAt;
}
