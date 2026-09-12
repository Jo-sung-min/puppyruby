package com.puppyruby.media;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

interface MediaUploadRepository extends JpaRepository<MediaUpload, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select upload from MediaUpload upload where upload.id = :id")
    Optional<MediaUpload> findLocked(@Param("id") String id);
}
