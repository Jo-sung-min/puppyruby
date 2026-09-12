package com.puppyruby.media;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@Component
class MediaRateLimiter {
    private final Map<String, Deque<Long>> entries = new HashMap<>();
    synchronized void take(String operation, String owner, int limit) {
        long now = System.currentTimeMillis(), start = now - 60_000;
        entries.entrySet().removeIf(entry -> entry.getValue().isEmpty() || entry.getValue().getLast() <= start);
        String key = operation + ":" + owner;
        if (!entries.containsKey(key) && entries.size() >= 4000) throw busy();
        for (String candidate : List.of(key, "global:" + operation)) {
            var times = entries.computeIfAbsent(candidate, ignored -> new ArrayDeque<>());
            while (!times.isEmpty() && times.getFirst() <= start) times.removeFirst();
            if (times.size() >= (candidate.equals(key) ? limit : 200)) throw busy();
        }
        entries.get(key).addLast(now); entries.get("global:" + operation).addLast(now);
    }
    private static ResponseStatusException busy() {
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "사진 요청이 많아요. 잠시 후 다시 시도해 주세요.");
    }
}
