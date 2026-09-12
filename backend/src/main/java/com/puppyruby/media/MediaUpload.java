package com.puppyruby.media;

import jakarta.persistence.*;

@Entity
@Table(name = "media_uploads", indexes = @Index(name = "media_owner_idx", columnList = "ownerPlayerId"))
class MediaUpload {
    @Id @Column(length = 36) String id;
    @Column(nullable = false, length = 36) String ownerPlayerId;
    @Column(nullable = false, length = 63) String bucket;
    @Column(nullable = false, unique = true, length = 256) String objectKey;
    @Column(nullable = false, length = 32) String contentType;
    @Column(nullable = false, length = 44) String sha256;
    long size;
    long createdAt;
    long expiresAt;
    Long completedAt;
    protected MediaUpload() {}
}
