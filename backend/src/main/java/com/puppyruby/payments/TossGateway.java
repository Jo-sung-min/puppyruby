package com.puppyruby.payments;

import java.util.List;

/** Only the provider adapter handles payment credentials or raw payment responses. */
interface TossGateway {
    Payment get(String paymentKey);
    Payment confirm(String paymentKey, String orderId, int amount, String idempotencyKey);
    record Cancel(int amount, String status, String transactionKey) {}
    record Payment(String paymentKey, String orderId, int amount, int balanceAmount, String currency,
                   String method, String provider, String status, Long approvedAt, String receiptUrl, List<Cancel> cancels) {}
    final class Failure extends RuntimeException {
        final boolean notFound;
        Failure(boolean notFound) { super("Payment provider unavailable"); this.notFound = notFound; }
    }
}
