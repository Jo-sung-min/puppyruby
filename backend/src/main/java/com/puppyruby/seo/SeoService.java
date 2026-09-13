package com.puppyruby.seo;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigInteger;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.*;

@Service
public class SeoService {
    public static final String DEFAULT_SITE_NAME = "PuppyRuby";
    public static final String DEFAULT_TITLE = "PuppyRuby · 너의 하루에 작은 멍! 하나";
    public static final String DEFAULT_DESCRIPTION = "평범한 화면 속, 특별한 내 강아지. 시바견부터 사모예드까지, 픽셀 강아지를 만나고 쓰다듬고 함께 놀아요. 설치 없이 시작하는 작은 행복.";
    public static final Set<String> PAGE_KEYS = Set.of("home", "play", "shop");
    private static final Set<String> PAGE_FIELDS = Set.of("title", "description", "indexable");
    private static final Set<String> INPUT_FIELDS = Set.of("siteName", "siteUrl", "defaultTitle", "defaultDescription", "ogImageUrl",
        "ogImageAlt", "googleVerification", "naverVerification", "indexingEnabled", "pages", "expectedRevision");
    private static final long MAX_REVISION = 9_007_199_254_740_991L;
    private final SeoRepository repository;
    private final SeoStore store;
    SeoService(SeoRepository repository, SeoStore store) { this.repository = repository; this.store = store; }

    public record Page(String title, String description, boolean indexable) {}
    public record Config(String siteName, String siteUrl, String defaultTitle, String defaultDescription, String ogImageUrl,
                         String ogImageAlt, String googleVerification, String naverVerification, boolean indexingEnabled,
                         Map<String, Page> pages, long revision, Long updatedAt) {}
    public record Input(String siteName, String siteUrl, String defaultTitle, String defaultDescription, String ogImageUrl,
                        String ogImageAlt, String googleVerification, String naverVerification, Boolean indexingEnabled,
                        Map<String, Page> pages, Long expectedRevision) {}

    static Map<String, Page> defaultPages() {
        return Map.of("home", new Page("", "", true), "play", new Page("우리 집 · PuppyRuby", "", true),
            "shop", new Page("상점 · PuppyRuby", "강아지 친구와 아우라, 치장품을 만나고 보관함에서 꾸며요.", true));
    }
    public static Config defaults() {
        return new Config(DEFAULT_SITE_NAME, "", DEFAULT_TITLE, DEFAULT_DESCRIPTION, "", "", "", "", true, defaultPages(), 0, null);
    }
    @Transactional(readOnly = true)
    public Config current() { return repository.findById(SeoSettings.ID).map(SeoService::view).orElseGet(SeoService::defaults); }

    /** The administrator's audit is saved by AdminSeoService in this same transaction. */
    @Transactional
    public Config update(Input raw) {
        Input input = validate(raw); store.ensureExists();
        SeoSettings settings = repository.findLocked().orElseThrow();
        if (settings.revision != input.expectedRevision() || settings.revision >= MAX_REVISION)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "다른 관리자가 검색 설정을 변경했어요. 최신 설정을 불러온 뒤 다시 저장해 주세요.");
        settings.siteName = input.siteName(); settings.siteUrl = input.siteUrl(); settings.defaultTitle = input.defaultTitle();
        settings.defaultDescription = input.defaultDescription(); settings.ogImageUrl = input.ogImageUrl(); settings.ogImageAlt = input.ogImageAlt();
        settings.googleVerification = input.googleVerification(); settings.naverVerification = input.naverVerification(); settings.indexingEnabled = input.indexingEnabled();
        settings.pages.clear(); input.pages().forEach((key, page) -> settings.pages.put(key, new SeoPage(page)));
        settings.revision++; settings.updatedAt = System.currentTimeMillis(); repository.flush(); return view(settings);
    }

    public static Input parse(Map<String, Object> body) {
        if (body == null || !body.keySet().equals(INPUT_FIELDS) || !(body.get("indexingEnabled") instanceof Boolean indexing)
            || !(body.get("pages") instanceof Map<?, ?> rawPages) || !rawPages.keySet().equals(PAGE_KEYS)) throw invalid();
        var pages = new LinkedHashMap<String, Page>();
        for (String key : PAGE_KEYS) {
            if (!(rawPages.get(key) instanceof Map<?, ?> page) || !page.keySet().equals(PAGE_FIELDS) || !(page.get("indexable") instanceof Boolean indexable)) throw invalid();
            pages.put(key, new Page(string(page, "title"), string(page, "description"), indexable));
        }
        Object rawRevision = body.get("expectedRevision"); long revision;
        if (rawRevision instanceof Byte || rawRevision instanceof Short || rawRevision instanceof Integer || rawRevision instanceof Long)
            revision = ((Number)rawRevision).longValue();
        else if (rawRevision instanceof BigInteger number && number.signum() >= 0 && number.compareTo(BigInteger.valueOf(MAX_REVISION)) <= 0)
            revision = number.longValueExact();
        else throw invalid();
        return validate(new Input(string(body, "siteName"), string(body, "siteUrl"), string(body, "defaultTitle"), string(body, "defaultDescription"),
            string(body, "ogImageUrl"), string(body, "ogImageAlt"), string(body, "googleVerification"), string(body, "naverVerification"), indexing, pages, revision));
    }
    private static Input validate(Input input) {
        if (input == null || input.expectedRevision() == null || input.expectedRevision() < 0 || input.expectedRevision() > MAX_REVISION
            || input.indexingEnabled() == null || input.pages() == null || !input.pages().keySet().equals(PAGE_KEYS)) throw invalid();
        var pages = new TreeMap<String, Page>();
        for (String key : PAGE_KEYS) {
            Page page = input.pages().get(key); if (page == null) throw invalid();
            pages.put(key, new Page(text(page.title(), 100, true), text(page.description(), 300, true), page.indexable()));
        }
        return new Input(text(input.siteName(), 60, false), https(input.siteUrl(), 300, true), text(input.defaultTitle(), 100, false),
            text(input.defaultDescription(), 300, false), https(input.ogImageUrl(), 2048, false), text(input.ogImageAlt(), 160, true),
            verification(input.googleVerification()), verification(input.naverVerification()), input.indexingEnabled(), Collections.unmodifiableMap(pages), input.expectedRevision());
    }
    private static Config view(SeoSettings settings) {
        var pages = new TreeMap<String, Page>(); settings.pages.forEach((key, page) -> pages.put(key, page.view()));
        return new Config(settings.siteName, settings.siteUrl, settings.defaultTitle, settings.defaultDescription, settings.ogImageUrl,
            settings.ogImageAlt, settings.googleVerification, settings.naverVerification, settings.indexingEnabled,
            Collections.unmodifiableMap(pages), settings.revision, settings.updatedAt);
    }
    private static String string(Map<?, ?> body, String field) {
        if (!(body.get(field) instanceof String value)) throw invalid(); return value;
    }
    private static String text(String value, int limit, boolean blank) {
        if (value == null || value.codePoints().anyMatch(c -> Character.isISOControl(c) || Character.getType(c) == Character.FORMAT)) throw invalid();
        String trimmed = value.replaceAll("(?U)^\\s+|\\s+$", "");
        if ((!blank && trimmed.isEmpty()) || trimmed.codePointCount(0, trimmed.length()) > limit) throw invalid();
        return trimmed;
    }
    private static String verification(String value) {
        String token = text(value, 200, true);
        if (!token.isEmpty() && !token.matches("[A-Za-z0-9_-]+")) throw invalid(); return token;
    }
    private static String https(String raw, int limit, boolean originOnly) {
        String value = text(raw, limit, true); if (value.isEmpty()) return value;
        try {
            URI uri = new URI(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getPort() == 0 || uri.getPort() > 65535) throw invalid();
            if (originOnly && (uri.getQuery() != null || uri.getFragment() != null || !(uri.getPath().isEmpty() || uri.getPath().equals("/")) || !publicHost(uri.getHost()))) throw invalid();
            String result = originOnly ? new URI("https", null, uri.getHost().toLowerCase(Locale.ROOT), uri.getPort() == 443 ? -1 : uri.getPort(), null, null, null).toASCIIString()
                : uri.toASCIIString();
            if (result.length() > limit) throw invalid(); return result;
        } catch (URISyntaxException error) { throw invalid(); }
    }
    private static boolean publicHost(String value) {
        String host = value.toLowerCase(Locale.ROOT).replaceFirst("\\.$", "");
        if (!host.contains(".") || host.equals("localhost") || host.endsWith(".localhost") || host.endsWith(".local") || host.startsWith("[") || host.contains(":")) return false;
        if (host.matches("[0-9.]+")) {
            String[] parts = host.split("\\."); if (parts.length != 4) return false;
            int[] bytes = new int[4];
            for (int index = 0; index < 4; index++) {
                if (!parts[index].matches("0|[1-9][0-9]{0,2}")) return false;
                bytes[index] = Integer.parseInt(parts[index]); if (bytes[index] > 255) return false;
            }
            int a = bytes[0], b = bytes[1];
            return !(a == 0 || a == 10 || a == 127 || a == 169 && b == 254 || a == 172 && b >= 16 && b <= 31 || a == 192 && b == 168 || a >= 224);
        }
        return true;
    }
    private static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "검색 설정의 제목·설명·HTTPS 주소·인증 코드와 설정 버전을 확인해 주세요.");
    }
}
