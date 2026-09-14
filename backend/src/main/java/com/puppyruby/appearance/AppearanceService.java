package com.puppyruby.appearance;

import com.puppyruby.game.BreedCatalog;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigInteger;
import java.util.*;

@Service
public class AppearanceService {
    public static final List<String> STYLES = List.of("classic", "round", "mochi", "chibi", "bean", "plush", "storybook", "bold",
        "retro", "mini", "sticker", "soft", "fluffy", "pocket", "cookie", "badge", "marshmallow", "dumpling", "pebble", "jellybean",
        "teacup", "loaf", "pear", "egg", "snowball", "teddy", "panda", "cub", "foxlet", "longbody", "tinyhead", "bigpaws",
        "cheeky", "squircle", "diamond", "toast", "waffle", "pixel8", "arcade", "robot", "paper", "origami", "patchwork",
        "pompom", "cloudlet", "sprout", "sleepy", "wink", "happy", "hug", "meadow",
        "cozy-chubby", "cozy-slim", "cozy-tall", "cozy-loaf", "bean-chubby", "bean-slim", "bean-tall", "bean-loaf",
        "bright-chubby", "bright-slim", "bright-tall", "bright-loaf", "button-chubby", "button-slim", "button-tall", "button-loaf",
        "premium-marshmallow", "premium-milkbean", "premium-honeybun", "premium-cloudpuff", "premium-biscuit", "premium-naploaf",
        "premium-teddycub", "premium-peachcheek", "premium-buttonpaw", "premium-rounddrop", "premium-cottonball", "premium-caramel",
        "art-01", "art-02", "art-03", "art-04", "art-05", "art-06", "art-07", "art-08", "art-09", "art-10",
        "art-11", "art-12", "art-13", "art-14", "art-15", "art-16", "art-17", "art-18", "art-19", "art-20",
        "art-21", "art-22", "art-23", "art-24", "art-25", "art-26", "art-27", "art-28", "art-29", "art-30", "art-16-scenes", "sp08-scenes", "sp15-scenes", "ruby-round-scenes", "animated-2d");
    public static final List<String> BREEDS = BreedCatalog.IDS;
    public static final List<String> SHAPES = List.of("original", "teddy", "fox");
    public static final List<String> PATTERNS = List.of("solid", "tuxedo", "patches", "freckles", "socks", "blaze");
    private static final long MAX_REVISION = 9_007_199_254_740_991L;
    private static final Set<String> INPUT_FIELDS = Set.of("defaultStyle", "breedStyles", "expectedRevision");
    private static final Set<String> INPUT_FIELDS_WITH_DELETIONS = Set.of("defaultStyle", "breedStyles", "expectedRevision", "deletedStyles");
    private static final Set<String> VARIETY_FIELDS = Set.of("id", "breed", "name", "style", "shape", "pattern", "coatColor", "patternColor");
    private final AppearanceRepository repository;
    private final AppearanceStore store;

    AppearanceService(AppearanceRepository repository, AppearanceStore store) { this.repository = repository; this.store = store; }
    public record Variety(String id, String breed, String name, String style, String shape, String pattern, String coatColor, String patternColor) {}
    public record Config(String defaultStyle, Map<String, String> breedStyles, long revision, Long updatedAt, List<String> deletedStyles,
                         List<Variety> varieties, Map<String, String> breedVarieties) {
        public Config(String defaultStyle, Map<String, String> breedStyles, long revision, Long updatedAt) {
            this(defaultStyle, breedStyles, revision, updatedAt, List.of());
        }
        public Config(String defaultStyle, Map<String, String> breedStyles, long revision, Long updatedAt, List<String> deletedStyles) {
            this(defaultStyle, breedStyles, revision, updatedAt, deletedStyles, List.of(), Map.of());
        }
    }
    public record Input(String defaultStyle, Map<String, String> breedStyles, Long expectedRevision, List<String> deletedStyles,
                        List<Variety> varieties, Map<String, String> breedVarieties) {
        /** A legacy caller must preserve the stored deletion list rather than restoring removed styles. */
        public Input(String defaultStyle, Map<String, String> breedStyles, Long expectedRevision) {
            this(defaultStyle, breedStyles, expectedRevision, null);
        }
        public Input(String defaultStyle, Map<String, String> breedStyles, Long expectedRevision, List<String> deletedStyles) {
            this(defaultStyle, breedStyles, expectedRevision, deletedStyles, null, null);
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
        input = validate(input);
        store.ensureExists();
        AppearanceSettings settings = repository.findLocked().orElseThrow();
        if (settings.revision != input.expectedRevision() || settings.revision >= MAX_REVISION)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "다른 관리자가 스타일을 변경했어요. 최신 설정을 불러온 뒤 다시 저장해 주세요.");
        Set<String> deleted = input.deletedStyles() == null ? new LinkedHashSet<>(settings.deletedStyles) : new LinkedHashSet<>(input.deletedStyles());
        List<Variety> varieties = input.varieties() == null ? settings.varieties.stream().map(AppearanceVariety::view).toList() : input.varieties();
        Map<String, String> breedVarieties = input.breedVarieties() == null ? new LinkedHashMap<>(settings.breedVarieties) : input.breedVarieties();
        if (deleted.contains(input.defaultStyle()) || input.breedStyles().values().stream().anyMatch(deleted::contains)
            || varieties.stream().anyMatch(variety -> variety.style() != null && deleted.contains(variety.style())))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "삭제한 스타일은 기본 또는 품종별 스타일로 사용할 수 없어요.");
        settings.defaultStyle = input.defaultStyle();
        settings.breedStyles.clear();
        settings.breedStyles.putAll(input.breedStyles());
        settings.deletedStyles.clear();
        settings.deletedStyles.addAll(deleted);
        settings.varieties.clear();
        varieties.forEach(value -> settings.varieties.add(new AppearanceVariety(value)));
        settings.breedVarieties.clear();
        settings.breedVarieties.putAll(breedVarieties);
        settings.revision++;
        settings.updatedAt = System.currentTimeMillis();
        repository.flush();
        return view(settings);
    }

    /** Explicit parsing rejects missing/unknown fields and JSON coercion such as "1" or 1.5 for a revision. */
    public static Input parse(Map<String, Object> body) {
        if (body == null) throw invalid();
        Set<String> fields = new HashSet<>(body.keySet());
        boolean hasVarieties = fields.remove("varieties"), hasBreedVarieties = fields.remove("breedVarieties");
        if (hasVarieties != hasBreedVarieties || !(fields.equals(INPUT_FIELDS) || fields.equals(INPUT_FIELDS_WITH_DELETIONS))
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
        List<Variety> varieties = null;
        Map<String, String> breedVarieties = null;
        if (hasVarieties) {
            if (!(body.get("varieties") instanceof List<?> rawVarieties) || rawVarieties.size() > 140
                || !(body.get("breedVarieties") instanceof Map<?, ?> rawBreedVarieties)) throw invalidVarieties();
            varieties = new ArrayList<>();
            for (Object raw : rawVarieties) {
                if (!(raw instanceof Map<?, ?> value) || !value.keySet().equals(VARIETY_FIELDS)) throw invalidVarieties();
                varieties.add(new Variety(string(value, "id", false), string(value, "breed", false), string(value, "name", false),
                    string(value, "style", true), string(value, "shape", false), string(value, "pattern", false),
                    string(value, "coatColor", true), string(value, "patternColor", false)));
            }
            breedVarieties = new LinkedHashMap<>();
            for (var entry : rawBreedVarieties.entrySet()) {
                if (!(entry.getKey() instanceof String breed) || !(entry.getValue() instanceof String id)) throw invalidVarieties();
                breedVarieties.put(breed, id);
            }
        }
        return validate(new Input(style, values, revision, deleted, varieties, breedVarieties));
    }

    private static Input validate(Input input) {
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
        if ((input.varieties() == null) != (input.breedVarieties() == null)) throw invalidVarieties();
        if (input.varieties() == null) return input;
        if (input.varieties().size() > 140) throw invalidVarieties();
        List<Variety> normalized = new ArrayList<>(); Map<String, Variety> byId = new LinkedHashMap<>();
        Set<String> names = new HashSet<>(); Map<String, Integer> counts = new HashMap<>();
        for (Variety value : input.varieties()) {
            if (value == null || !canonicalId(value.id()) || value.breed() == null || !BREEDS.contains(value.breed())
                || value.name() == null || value.style() != null && !STYLES.contains(value.style())
                || value.shape() == null || !SHAPES.contains(value.shape()) || value.pattern() == null || !PATTERNS.contains(value.pattern())
                || value.coatColor() != null && !hex(value.coatColor()) || !hex(value.patternColor())) throw invalidVarieties();
            String name = value.name().replaceAll("(?U)^\\s+|\\s+$", "");
            if (name.isEmpty() || name.codePointCount(0, name.length()) > 24
                || name.codePoints().anyMatch(c -> Character.isISOControl(c) || Character.getType(c) == Character.FORMAT)
                || !names.add(value.breed() + ":" + name.replaceAll("(?U)\\s+", " ").toLowerCase(Locale.ROOT))
                || counts.merge(value.breed(), 1, Integer::sum) > 20) throw invalidVarieties();
            var variety = new Variety(value.id(), value.breed(), name, value.style(), value.shape(), value.pattern(),
                value.coatColor() == null ? null : value.coatColor().toUpperCase(Locale.ROOT), value.patternColor().toUpperCase(Locale.ROOT));
            if (byId.put(variety.id(), variety) != null) throw invalidVarieties();
            normalized.add(variety);
        }
        for (var entry : input.breedVarieties().entrySet()) {
            Variety selected = byId.get(entry.getValue());
            if (entry.getKey() == null || !BREEDS.contains(entry.getKey()) || selected == null || !selected.breed().equals(entry.getKey())) throw invalidVarieties();
        }
        return new Input(input.defaultStyle(), input.breedStyles(), input.expectedRevision(), input.deletedStyles(),
            List.copyOf(normalized), Collections.unmodifiableMap(new LinkedHashMap<>(input.breedVarieties())));
    }
    private static Config view(AppearanceSettings settings) {
        return new Config(settings.defaultStyle, Collections.unmodifiableMap(new TreeMap<>(settings.breedStyles)), settings.revision, settings.updatedAt,
            STYLES.stream().filter(settings.deletedStyles::contains).toList(), settings.varieties.stream().map(AppearanceVariety::view).toList(),
            Collections.unmodifiableMap(new TreeMap<>(settings.breedVarieties)));
    }
    private static boolean canonicalId(String value) {
        try { return value != null && UUID.fromString(value).toString().equals(value); }
        catch (IllegalArgumentException error) { return false; }
    }
    private static boolean hex(String value) { return value != null && value.matches("#[0-9a-fA-F]{6}"); }
    private static String string(Map<?, ?> value, String key, boolean nullable) {
        Object field = value.get(key);
        if (nullable && field == null) return null;
        if (!(field instanceof String text)) throw invalidVarieties();
        return text;
    }
    private static ResponseStatusException invalidVarieties() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "견종별 세부 타입의 이름·스타일·체형·무늬를 확인해 주세요. 견종마다 20개까지 등록할 수 있어요.");
    }
    private static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "기본 스타일, 품종별 스타일, 설정 버전을 확인해 주세요.");
    }
}
