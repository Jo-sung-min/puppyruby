package com.puppyruby.desktop;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@Component
class PairingRateLimiter {
    static final int MAX_FAILURES = 10;
    static final int MAX_GLOBAL_FAILURES = 1000;
    static final long WINDOW_MS = 60_000;
    private record Bucket(int failures, long expiresAt) {}
    private final Map<String, Bucket> buckets = new LinkedHashMap<>();
    private Bucket global;

    synchronized void check(String codePrefix, long now) {
        expire(now);
        if (global != null && global.failures >= MAX_GLOBAL_FAILURES)
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "지금 연결 요청이 많아요. 잠시 후 다시 시도해 주세요.");
        Bucket bucket = buckets.get(codePrefix);
        if (bucket != null && bucket.failures >= MAX_FAILURES)
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "연결 코드가 여러 번 맞지 않았어요. 1분 뒤 다시 시도해 주세요.");
    }

    synchronized void failed(String codePrefix, long now) {
        expire(now);
        Bucket bucket = buckets.get(codePrefix);
        if (bucket == null && buckets.size() >= 1024) buckets.remove(buckets.keySet().iterator().next());
        buckets.put(codePrefix, new Bucket(bucket == null ? 1 : bucket.failures + 1, bucket == null ? now + WINDOW_MS : bucket.expiresAt));
        global = new Bucket(global == null ? 1 : global.failures + 1, global == null ? now + WINDOW_MS : global.expiresAt);
    }

    private void expire(long now) {
        buckets.entrySet().removeIf(entry -> entry.getValue().expiresAt <= now);
        if (global != null && global.expiresAt <= now) global = null;
    }
}
