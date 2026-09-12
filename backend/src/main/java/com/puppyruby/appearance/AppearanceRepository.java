package com.puppyruby.appearance;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import java.util.Optional;

interface AppearanceRepository extends JpaRepository<AppearanceSettings, String> {
    @Query("select settings from AppearanceSettings settings left join fetch settings.breedStyles where settings.id = 'global'")
    Optional<AppearanceSettings> findCurrent();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select settings from AppearanceSettings settings where settings.id = 'global'")
    Optional<AppearanceSettings> findLocked();
}
