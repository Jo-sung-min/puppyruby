package com.puppyruby.auth;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

/** Counters are bounded and independent of database rollbacks; proxy IP is never a user identity. */
@Component
class AuthRateLimiter {
    private static final long WINDOW = 60_000;
    private static final int MAX_BUCKETS = 4096;
    private final Map<String, Bucket> buckets = new HashMap<>();
    private record Bucket(long starts, int count) {}
    synchronized void take(String operation, String key, int individualLimit, int globalLimit) {
        long now = System.currentTimeMillis();
        buckets.entrySet().removeIf(entry -> now - entry.getValue().starts >= WINDOW);
        String global = "global:" + operation;
        String individual = operation + ":" + AuthService.hash(Objects.toString(key, ""));
        if ((!buckets.containsKey(global) || !buckets.containsKey(individual)) && buckets.size() >= MAX_BUCKETS - 2)
            throw limited();
        Bucket all = buckets.getOrDefault(global, new Bucket(now, 0));
        Bucket one = buckets.getOrDefault(individual, new Bucket(now, 0));
        if (all.count >= globalLimit || one.count >= individualLimit) throw limited();
        buckets.put(global, new Bucket(all.starts, all.count + 1));
        buckets.put(individual, new Bucket(one.starts, one.count + 1));
    }
    private ResponseStatusException limited() { return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "요청이 많아요. 잠시 후 다시 시도해 주세요."); }
}
