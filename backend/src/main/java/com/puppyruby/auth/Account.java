package com.puppyruby.auth;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

@Entity
@Table(name = "accounts")
public class Account {
    public enum Role { USER, ADMIN }
    public enum Status { ACTIVE, SUSPENDED }
    @Id @Column(length = 36) public String id;
    @Column(unique = true, length = 254) public String email;
    @JsonIgnore @Column(length = 100) public String passwordHash;
    @JsonIgnore @Column(unique = true, length = 40) public String kakaoId;
    @Column(nullable = false, length = 40) public String displayName;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) public Role role = Role.USER;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) public Status status = Status.ACTIVE;
    public boolean emailVerified;
    @JsonIgnore @Column(unique = true, nullable = false, length = 36) public String playerId;
    public long createdAt;
    public Account() {}
    public String getId() { return id; }
    public String getEmail() { return email; }
    @JsonIgnore public String getPasswordHash() { return passwordHash; }
    @JsonIgnore public String getKakaoId() { return kakaoId; }
    public String getDisplayName() { return displayName; }
    public Role getRole() { return role; }
    public Status getStatus() { return status; }
    public boolean isEmailVerified() { return emailVerified; }
    @JsonIgnore public String getPlayerId() { return playerId; }
    public long getCreatedAt() { return createdAt; }
}
