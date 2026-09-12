package com.puppyruby.payments;

import jakarta.persistence.*;

@Entity
@Table(name = "payment_orders", uniqueConstraints = {
    @UniqueConstraint(name = "payment_account_request_unique", columnNames = {"account_id", "request_id"}),
    @UniqueConstraint(name = "payment_key_unique", columnNames = "payment_key")
}, indexes = @Index(name = "payment_account_created", columnList = "account_id,created_at"))
class PaymentOrder {
    @Id @Column(length = 64) String id;
    @Column(name = "account_id", nullable = false, length = 36) String accountId;
    @Column(name = "request_id", nullable = false, length = 36) String requestId;
    @Column(nullable = false, length = 80) String productId;
    @Column(nullable = false) long catalogRevision;
    @Column(nullable = false, length = 100) String orderName;
    @Column(nullable = false, length = 32) String kind;
    @Column(nullable = false) int quantity;
    @Column(nullable = false) int amount;
    @Column(nullable = false, length = 36) String customerKey;
    @Column(nullable = false, length = 8) String mode;
    @Column(nullable = false, length = 32) String status = "CREATED";
    @Column(name = "created_at", nullable = false) long createdAt;
    @Column(nullable = false) long termsAcceptedAt;
    @Column(nullable = false, length = 32) String termsVersion = "purchase-2026-09-12";
    @Column(name = "payment_key", length = 200) String paymentKey;
    @Column(nullable = false, length = 36) String idempotencyKey;
    Long confirmationRequestedAt;
    Long approvalSentAt;
    Long paidAt;
    @Column(nullable = false) boolean ticketsGranted;
    @Column(nullable = false) int refundedAmount;
    @Column(nullable = false) int reversedQuantity;
    @Column(length = 2048) String receiptUrl;
    @Column(length = 36) String claimToken;
    @Column(nullable = false) long claimUntil;
    Long checkedAt;
    @Column(length = 40) String lastFailure;
    protected PaymentOrder() {}
}
