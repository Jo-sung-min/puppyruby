package com.puppyruby.commerce;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigInteger;
import java.util.*;

final class CommerceInput {
    static final long MAX_SAFE = 9_007_199_254_740_991L;
    private CommerceInput() {}
    static Map<?, ?> fields(Object value, String... fields) {
        if (!(value instanceof Map<?, ?> map) || !map.keySet().equals(Set.of(fields))) throw bad("입력 항목을 확인해 주세요.");
        return map;
    }
    static List<?> list(Object value, int size) {
        if (!(value instanceof List<?> list) || list.size() != size) throw bad("모든 상품과 확률 항목을 빠짐없이 보내 주세요.");
        return list;
    }
    static String text(Object value) { if (!(value instanceof String text) || text.isEmpty()) throw bad("입력 내용을 확인해 주세요."); return text; }
    static boolean bool(Object value) { if (!(value instanceof Boolean result)) throw bad("설정 값을 확인해 주세요."); return result; }
    static long integer(Object value, long min, long max) {
        long result;
        if (value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long) result = ((Number) value).longValue();
        else if (value instanceof BigInteger number && number.bitLength() < 63) result = number.longValueExact();
        else throw bad("정수 값을 입력해 주세요.");
        if (result < min || result > max) throw bad("설정 값의 허용 범위를 확인해 주세요.");
        return result;
    }
    static String kind(Object value) {
        String result = text(value); if (!CommerceDefinitions.KINDS.contains(result)) throw bad("뽑기권 종류를 확인해 주세요."); return result;
    }
    static String uuid(Object value) {
        String result = text(value);
        if (!result.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) throw bad("요청 식별자를 확인해 주세요.");
        return UUID.fromString(result).toString();
    }
    static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
