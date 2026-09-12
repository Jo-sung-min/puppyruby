package com.puppyruby.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;

/** Official authorization-code exchange; no caller-supplied provider ID or access token is accepted. */
@Component
class KakaoClient {
    record Identity(String id, String email, boolean emailVerified, String nickname) {}
    private final String key, secret, callback;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    KakaoClient(ObjectMapper mapper, @Value("${KAKAO_REST_API_KEY:}") String key,
                @Value("${KAKAO_CLIENT_SECRET:}") String secret,
                @Value("${PUBLIC_SITE_URL:http://127.0.0.1:3001}") String site) {
        this.mapper = mapper; this.key = key; this.secret = secret;
        this.callback = AuthSite.origin(site) + "/api/auth/kakao/callback";
    }
    boolean enabled() { return !key.isBlank(); }
    Identity exchange(String code, String redirectUri) {
        if (!enabled()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "카카오 로그인 설정이 아직 준비되지 않았어요.");
        if (!callback.equals(redirectUri) || code == null || code.isBlank() || code.length() > 2048)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "카카오 로그인 요청을 다시 시작해 주세요.");
        String form = "grant_type=authorization_code&client_id=" + encode(key) + "&redirect_uri=" + encode(callback) + "&code=" + encode(code);
        if (!secret.isBlank()) form += "&client_secret=" + encode(secret);
        try {
            Map<?, ?> tokens = request(HttpRequest.newBuilder(URI.create("https://kauth.kakao.com/oauth/token"))
                .header("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")
                .POST(HttpRequest.BodyPublishers.ofString(form)).timeout(Duration.ofSeconds(10)).build());
            Object rawToken = tokens.get("access_token");
            if (!(rawToken instanceof String token) || token.isBlank() || token.length() > 8192) throw failed();
            Map<?, ?> user = request(HttpRequest.newBuilder(URI.create("https://kapi.kakao.com/v2/user/me"))
                .header("Authorization", "Bearer " + token).GET().timeout(Duration.ofSeconds(10)).build());
            return identity(user);
        } catch (InterruptedException error) { Thread.currentThread().interrupt(); throw failed(); }
        catch (Exception error) { throw failed(); }
    }
    private Map<?, ?> request(HttpRequest request) throws Exception {
        var response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        try (var body = response.body()) {
            byte[] bytes = body.readNBytes(65_537);
            if (response.statusCode() != 200 || bytes.length > 65_536) throw failed();
            return mapper.readValue(bytes, Map.class);
        }
    }
    static Identity identity(Map<?, ?> user) {
        Object id = user.get("id");
        String providerId = Objects.toString(id, "");
        if (!(id instanceof Number) || !providerId.matches("[1-9][0-9]{0,19}")) throw failed();
        Map<?, ?> account = user.get("kakao_account") instanceof Map<?, ?> details ? details : Map.of();
        boolean verified = Boolean.TRUE.equals(account.get("is_email_valid")) && Boolean.TRUE.equals(account.get("is_email_verified"));
        String email = verified && account.get("email") instanceof String address ? address : null;
        Map<?, ?> profile = account.get("profile") instanceof Map<?, ?> details ? details : Map.of();
        String nickname = profile.get("nickname") instanceof String name ? name : "카카오 친구";
        return new Identity(providerId, email, verified && email != null, nickname);
    }
    private static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    private static ResponseStatusException failed() { return new ResponseStatusException(HttpStatus.BAD_GATEWAY, "카카오 로그인을 완료하지 못했어요. 다시 시도해 주세요."); }
}
