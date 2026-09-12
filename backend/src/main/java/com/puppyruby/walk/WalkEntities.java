package com.puppyruby.walk;

import jakarta.persistence.*;

@Entity @Table(name = "walk_mutex")
class WalkMutex {
    @Id String id;
    protected WalkMutex() {}
    WalkMutex(String id) { this.id = id; }
}

@Entity @Table(name = "walk_profiles")
class SocialProfile {
    @Id String id;
    @Column(nullable = false, unique = true) String playerId;
    @Column(nullable = false, length = 48) String nickname;
    Integer age;
    @Column(length = 80) String realName;
    @Column(length = 200000) String photo;
    boolean configured;
    String roomId;
    long lastSeen;
    long joinedAt;
    long lastMessage;
    long lastMove;
    double x;
    double y;
    String puppyId;
    String puppyName;
    int puppyBreed;
    String puppyGrade;
    String puppyFur;
    String puppyEyes;
    String puppyAccessory;
}

@Entity @Table(name = "walk_rooms")
class SocialRoom {
    @Id String id;
    @Column(nullable = false, length = 80) String title;
    @Column(nullable = false, length = 240) String description;
    @Column(nullable = false, length = 16) String theme;
    int capacity;
    String ownerId;
    long createdAt;
    Long closedAt;
}

@Entity @Table(name = "walk_messages")
class SocialMessage {
    @Id String id;
    @Column(nullable = false) String roomId;
    @Column(nullable = false) String authorId;
    @Column(nullable = false, unique = true) String dedupeKey;
    @Column(nullable = false, length = 1000) String text;
    long createdAt;
    Long hiddenAt;
}

@Entity @Table(name = "walk_friendships")
class SocialFriendship {
    @Id String id;
    @Column(nullable = false) String requesterId;
    @Column(nullable = false) String recipientId;
    boolean accepted;
    long createdAt;
}
