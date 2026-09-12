package com.puppyruby.payments;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Component
public final class PaymentSettings {
    private final String clientKey, secretKey, mode;
    private final boolean enabled;
    public PaymentSettings(@Value("${TOSS_CLIENT_KEY:}") String clientKey,
                           @Value("${TOSS_SECRET_KEY:}") String secretKey,
                           @Value("${TOSS_LIVE_ENABLED:false}") boolean liveEnabled,
                           @Value("${PUBLIC_SITE_URL:http://127.0.0.1:3000}") String site) {
        this.clientKey = clean(clientKey); this.secretKey = clean(secretKey);
        boolean test = key(this.clientKey, "test_ck_") && key(this.secretKey, "test_sk_");
        boolean live = key(this.clientKey, "live_ck_") && key(this.secretKey, "live_sk_");
        enabled = validSite(site) && (test || (live && liveEnabled));
        mode = enabled ? (test ? "test" : "live") : "disabled";
    }
    public record Config(boolean enabled, String mode, String clientKey, String message) {}
    public Config config() {
        return new Config(enabled, mode, enabled ? clientKey : null,
            !enabled ? "결제 준비 중이에요. 지금은 이용권을 구매할 수 없어요."
                : mode.equals("test") ? "테스트 결제예요. 실제 금액이 청구되지 않아요." : "토스페이로 안전하게 결제할 수 있어요.");
    }
    void requireEnabled() { if (!enabled) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, config().message()); }
    String mode() { return mode; }
    String authorization() {
        requireEnabled();
        return "Basic " + Base64.getEncoder().encodeToString((secretKey + ":").getBytes(StandardCharsets.UTF_8));
    }
    private static String clean(String value) { return value == null ? "" : value.strip(); }
    private static boolean key(String value, String prefix) {
        return value.startsWith(prefix) && value.length() > prefix.length() && value.length() <= 300
            && value.matches("[A-Za-z0-9_-]+");
    }
    static boolean validSite(String value) {
        try {
            URI uri = URI.create(value); String host = uri.getHost();
            if (host == null || uri.getScheme() == null) return false;
            boolean local = Set.of("localhost", "127.0.0.1", "::1", "[::1]").contains(host.toLowerCase(Locale.ROOT));
            return ("https".equalsIgnoreCase(uri.getScheme()) || ("http".equalsIgnoreCase(uri.getScheme()) && local))
                && uri.getRawUserInfo() == null && uri.getRawQuery() == null && uri.getRawFragment() == null
                && (uri.getRawPath() == null || uri.getRawPath().isEmpty() || uri.getRawPath().equals("/"))
                && uri.getPort() >= -1 && uri.getPort() != 0 && uri.getPort() <= 65535;
        } catch (RuntimeException invalid) { return false; }
    }
}
