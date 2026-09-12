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
    private static final Set<String> INPUT_FIELDS_WITH_DELETIONS = Set.of("defaultStyle", "breedStyles", "expectedRevision", "deletedStyles");
    private final AppearanceRepository repository;
    private final AppearanceStore store;

    AppearanceService(AppearanceRepository repository, AppearanceStore store) { this.repository = repository; this.store = store; }
    public record Config(String defaultStyle, Map<String, String> breedStyles, long revision, Long updatedAt, List<String> deletedStyles) {
        public Config(String defaultStyle, Map<String, String> breedStyles, long revision, Long updatedAt) {
            this(defaultStyle, breedStyles, revision, updatedAt, List.of());
        }
    }
    public record Input(String defaultStyle, Map<String, String> breedStyles, Long expectedRevision, List<String> deletedStyles) {
        /** A legacy caller must preserve the stored deletion list rather than restoring removed styles. */
        public Input(String defaultStyle, Map<String, String> breedStyles, Long expectedRevision) {
            this(defaultStyle, breedStyles, expectedRevision, null);
        }
    }

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
        Set<String> deleted = input.deletedStyles() == null ? new LinkedHashSet<>(settings.deletedStyles) : new LinkedHashSet<>(input.deletedStyles());
        if (deleted.contains(input.defaultStyle()) || input.breedStyles().values().stream().anyMatch(deleted::contains))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "삭제한 스타일은 기본 또는 품종별 스타일로 사용할 수 없어요.");
        settings.defaultStyle = input.defaultStyle();
        settings.breedStyles.clear();
        settings.breedStyles.putAll(input.breedStyles());
        settings.deletedStyles.clear();
        settings.deletedStyles.addAll(deleted);
        settings.revision++;
        settings.updatedAt = System.currentTimeMillis();
        repository.flush();
        return view(settings);
    }

    /** Explicit parsing rejects missing/unknown fields and JSON coercion such as "1" or 1.5 for a revision. */
    public static Input parse(Map<String, Object> body) {
        if (body == null || !(body.keySet().equals(INPUT_FIELDS) || body.keySet().equals(INPUT_FIELDS_WITH_DELETIONS))
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
        List<String> deleted = null;
        if (body.containsKey("deletedStyles")) {
            if (!(body.get("deletedStyles") instanceof List<?> rawDeleted)) throw invalid();
            deleted = new ArrayList<>();
            for (Object raw : rawDeleted) {
                if (!(raw instanceof String id)) throw invalid();
                deleted.add(id);
            }
        }
        Input result = new Input(style, values, revision, deleted);
        validate(result);
        return result;
    }

    private static void validate(Input input) {
        if (input == null || input.defaultStyle() == null || !STYLES.contains(input.defaultStyle()) || input.breedStyles() == null
            || input.expectedRevision() == null || input.expectedRevision() < 0 || input.expectedRevision() > MAX_REVISION)
            throw invalid();
        for (var entry : input.breedStyles().entrySet())
            if (entry.getKey() == null || entry.getValue() == null || !BREEDS.contains(entry.getKey()) || !STYLES.contains(entry.getValue())) throw invalid();
        if (input.deletedStyles() != null) {
            if (input.deletedStyles().size() >= STYLES.size() || new HashSet<>(input.deletedStyles()).size() != input.deletedStyles().size()
                || input.deletedStyles().stream().anyMatch(id -> id == null || !STYLES.contains(id)))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "삭제할 스타일을 확인해 주세요. 사용할 스타일은 하나 이상 남겨야 해요.");
        }
    }
    private static Config view(AppearanceSettings settings) {
        return new Config(settings.defaultStyle, Collections.unmodifiableMap(new TreeMap<>(settings.breedStyles)), settings.revision, settings.updatedAt,
            STYLES.stream().filter(settings.deletedStyles::contains).toList());
    }
    private static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "기본 스타일, 품종별 스타일, 설정 버전을 확인해 주세요.");
    }
}
