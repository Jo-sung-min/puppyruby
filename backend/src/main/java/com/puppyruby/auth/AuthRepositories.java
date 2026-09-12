package com.puppyruby.auth;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import java.util.*;

interface AuthMutexRepository extends JpaRepository<AuthMutex, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from AuthMutex m where m.id = 'auth'")
    Optional<AuthMutex> lock();
}
interface AuthSessionRepository extends JpaRepository<AuthSession, String> {
    List<AuthSession> findByAccountIdOrderByCreatedAtDesc(String accountId);
    void deleteByAccountId(String accountId);
    void deleteByExpiresAtLessThanEqual(long now);
}
interface AuthEmailTokenRepository extends JpaRepository<AuthEmailToken, String> {
    List<AuthEmailToken> findByAccountIdAndKind(String accountId, AuthEmailToken.Kind kind);
    void deleteByAccountIdAndKind(String accountId, AuthEmailToken.Kind kind);
    void deleteByAccountId(String accountId);
    void deleteByExpiresAtLessThanEqual(long now);
}
