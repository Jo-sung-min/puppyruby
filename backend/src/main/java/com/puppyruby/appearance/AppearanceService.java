package com.puppyruby.appearance;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigInteger;
import java.util.*;

@Service
public class AppearanceService {
    public static final List<String> STYLES = List.of("classic", "round", "mochi", "chibi", "bean", "plush", "storybook", "bold",
        "retro", "mini", "sticker", "soft", "fluffy", "pocket", "cookie", "badge");
    public static final List<String> BREEDS = List.of("pomeranian", "poodle", "maltese", "shiba", "corgi", "beagle", "samoyed");
    private static final long MAX_REVISION = 9_007_199_254_740_991L;
    private static final Set<String> INPUT_FIELDS = Set.of("defaultStyle", "breedStyles", "expectedRevision");
    private final AppearanceRepository repository;
    private final AppearanceStore store;

    AppearanceService(AppearanceRepository repository, AppearanceStore store) { this.repository = repository; this.store = store; }
    public record Config(String defaultStyle, Map<String, String> breedStyles, long revision, Long updatedAt) {}
    public record Input(String defaultStyle, Map<String, String> breedStyles, Long expectedRevision) {}

    @Transactional(readOnly = true)
    public Config current() {
        return repository.findCurrent().map(AppearanceService::view)
            .orElseGet(() -> new Config("classic", Map.of(), 0, null));
    }

    /** The administrator service authorizes and records its audit in this same transaction. */
    @Transactional
    public Config update(Input input) {
        validate(input);
        store.ensureExists();
        AppearanceSettings settings = repository.findLocked().orElseThrow();
        if (settings.revision != input.expectedRevision() || settings.revision >= MAX_REVISION)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "다른 관리자가 스타일을 변경했어요. 최신 설정을 불러온 뒤 다시 저장해 주세요.");
        settings.defaultStyle = input.defaultStyle();
        settings.breedStyles.clear();
        settings.breedStyles.putAll(input.breedStyles());
        settings.revision++;
        settings.updatedAt = System.currentTimeMillis();
        repository.flush();
        return view(settings);
    }

    /** Explicit parsing rejects missing/unknown fields and JSON coercion such as "1" or 1.5 for a revision. */
    public static Input parse(Map<String, Object> body) {
        if (body == null || !body.keySet().equals(INPUT_FIELDS)
            || !(body.get("defaultStyle") instanceof String style)
            || !(body.get("breedStyles") instanceof Map<?, ?> overrides)) throw invalid();
        Object rawRevision = body.get("expectedRevision");
        long revision;
        if (rawRevision instanceof Byte || rawRevision instanceof Short || rawRevision instanceof Integer || rawRevision instanceof Long)
            revision = ((Number) rawRevision).longValue();
        else if (rawRevision instanceof BigInteger number && number.signum() >= 0 && number.compareTo(BigInteger.valueOf(MAX_REVISION)) <= 0)
            revision = number.longValueExact();
        else throw invalid();
        Map<String, String> values = new LinkedHashMap<>();
        for (var entry : overrides.entrySet()) {
            if (!(entry.getKey() instanceof String breed) || !(entry.getValue() instanceof String override)) throw invalid();
            values.put(breed, override);
        }
        Input result = new Input(style, values, revision);
        validate(result);
        return result;
    }

    private static void validate(Input input) {
        if (input == null || input.defaultStyle() == null || !STYLES.contains(input.defaultStyle()) || input.breedStyles() == null
            || input.expectedRevision() == null || input.expectedRevision() < 0 || input.expectedRevision() > MAX_REVISION)
            throw invalid();
        for (var entry : input.breedStyles().entrySet())
            if (entry.getKey() == null || entry.getValue() == null || !BREEDS.contains(entry.getKey()) || !STYLES.contains(entry.getValue())) throw invalid();
    }
    private static Config view(AppearanceSettings settings) {
        return new Config(settings.defaultStyle, Collections.unmodifiableMap(new TreeMap<>(settings.breedStyles)), settings.revision, settings.updatedAt);
    }
    private static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "기본 스타일, 품종별 스타일, 설정 버전을 확인해 주세요.");
    }
}
