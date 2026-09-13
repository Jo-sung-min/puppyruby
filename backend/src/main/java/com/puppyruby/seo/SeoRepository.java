package com.puppyruby.seo;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import java.util.Optional;

interface SeoRepository extends JpaRepository<SeoSettings, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select settings from SeoSettings settings where settings.id = 'global'")
    Optional<SeoSettings> findLocked();
}
