package com.puppyruby.payments;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;

interface PaymentOrderRepository extends JpaRepository<PaymentOrder, String> {
    Optional<PaymentOrder> findByAccountIdAndRequestId(String accountId, String requestId);
    List<PaymentOrder> findTop50ByAccountIdOrderByCreatedAtDesc(String accountId);
    Optional<PaymentOrder> findByPaymentKey(String paymentKey);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PaymentOrder p where p.id = :id")
    Optional<PaymentOrder> lockById(@Param("id") String id);
}
