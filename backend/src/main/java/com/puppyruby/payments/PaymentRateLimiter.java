package com.puppyruby.payments;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@Component
final class PaymentRateLimiter {
    private final Map<String, Deque<Long>> entries = new HashMap<>();
    synchronized void take(String key, int limit) {
        long now = System.currentTimeMillis(), start = now - 60_000;
        entries.entrySet().removeIf(entry -> entry.getValue().isEmpty() || entry.getValue().getLast() < start);
        if (!entries.containsKey(key) && entries.size() >= 4000) throw busy();
        Deque<Long> times = entries.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        while (!times.isEmpty() && times.getFirst() < start) times.removeFirst();
        if (times.size() >= limit) throw busy();
        times.addLast(now);
    }
    private static ResponseStatusException busy() { return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "잠시 뒤 결제 상태를 다시 확인해 주세요."); }
}
