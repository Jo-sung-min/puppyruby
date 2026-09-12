package com.puppyruby.auth;

import org.springframework.data.jpa.repository.*;
import java.util.Optional;

public interface AccountRepository extends JpaRepository<Account, String>, JpaSpecificationExecutor<Account> {
    Optional<Account> findByEmail(String email);
    Optional<Account> findByKakaoId(String kakaoId);
    Optional<Account> findByPlayerId(String playerId);
    boolean existsByPlayerId(String playerId);
}
