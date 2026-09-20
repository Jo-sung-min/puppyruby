package com.puppyruby.game;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.*;
import java.util.regex.Pattern;

/**
 * The one backend view of the shared accessory contract.
 *
 * <p>Catalog IDs are persisted verbatim in puppies, walk snapshots, draw history and wallet keys,
 * so an invalid catalog must stop startup instead of being partially accepted.</p>
 */
@Component
public final class AccessoryCatalog {
    private static final int SCHEMA_VERSION = 1;
    private static final Pattern ID = Pattern.compile("[a-z0-9]+(?:-[a-z0-9]+)*");
    private static final Pattern REVISION = Pattern.compile("[A-Za-z0-9._-]{1,80}");
    private static final Pattern SHA256 = Pattern.compile("[a-f0-9]{64}");
    private static final Set<String> ROOT_FIELDS = Set.of("schemaVersion", "revision", "items");
    private static final Set<String> ITEM_REQUIRED = Set.of("id", "label", "availability", "slot", "layer", "renderer", "revision");
    private static final Set<String> ITEM_ALLOWED = Set.of("id", "label", "emoji", "availability", "slot", "layer", "renderer", "revision",
        "grade", "weight", "asset", "defaultTransform");
    private static final Set<String> ASSET_FIELDS = Set.of("png", "sha256", "width", "height", "pivotX", "pivotY");
    private static final Set<String> TRANSFORM_FIELDS = Set.of("offsetX", "offsetY", "scaleX", "scaleY", "rotation", "flipX");
    private static final Set<String> AVAILABILITIES = Set.of("free", "paid");
    private static final Set<String> SLOTS = Set.of("face", "head", "neck", "back");
    private static final Set<String> LAYERS = Set.of("behind", "front");
    private static final Set<String> RENDERERS = Set.of("builtin", "image");
    private static final Set<String> LEGACY_FREE = Set.of("ribbon", "scarf", "crown");
    private static final Set<String> LEGACY_PAID = Set.of("bow-blue", "bow-lilac", "party-hat", "flower", "glasses", "halo", "angel-wings");
    private static final Set<String> LEGACY_BUILTINS;

    static {
        var all = new HashSet<>(LEGACY_FREE);
        all.addAll(LEGACY_PAID);
        LEGACY_BUILTINS = Set.copyOf(all);
    }

    public record Asset(String png, String sha256, int width, int height, double pivotX, double pivotY) {}
    public record Transform(double offsetX, double offsetY, double scaleX, double scaleY, double rotation, boolean flipX) {}
    public record Item(String id, String label, String emoji, String availability, String slot, String layer,
                       String renderer, String revision, Grade grade, Integer weight, Asset asset, Transform defaultTransform) {
        public boolean free() { return availability.equals("free"); }
        public boolean paid() { return availability.equals("paid"); }
    }
    private record Parsed(String revision, List<Item> items) {}

    private final String revision;
    private final List<Item> items;
    private final List<Item> free;
    private final List<Item> paid;
    private final Map<String, Item> byId;

    @Autowired
    public AccessoryCatalog(ObjectMapper mapper) {
        this(load(mapper));
    }

    /** Test seam for proving malformed catalogs fail closed. */
    AccessoryCatalog(ObjectMapper mapper, String json) {
        this(parse(mapper, json));
    }

    private AccessoryCatalog(Parsed parsed) {
        revision = parsed.revision();
        items = parsed.items();
        free = items.stream().filter(Item::free).toList();
        paid = items.stream().filter(Item::paid).toList();
        var index = new LinkedHashMap<String, Item>();
        items.forEach(item -> index.put(item.id(), item));
        byId = Collections.unmodifiableMap(index);
    }

    public String revision() { return revision; }
    public List<Item> all() { return items; }
    public List<Item> free() { return free; }
    public List<Item> paid() { return paid; }
    public Optional<Item> find(String id) { return Optional.ofNullable(byId.get(id)); }
    public boolean isFree(String id) { return find(id).map(Item::free).orElse(false); }
    public boolean isPaid(String id) { return find(id).map(Item::paid).orElse(false); }

    private static Parsed load(ObjectMapper mapper) {
        try (var source = AccessoryCatalog.class.getResourceAsStream("/accessories.json")) {
            if (source == null) throw invalid("공유 액세서리 목록 accessories.json이 없습니다.");
            return parse(mapper.readTree(source));
        } catch (IOException error) {
            throw new IllegalStateException("공유 액세서리 목록을 읽을 수 없습니다.", error);
        }
    }

    private static Parsed parse(ObjectMapper mapper, String json) {
        return parse(mapper.readTree(json));
    }

    private static Parsed parse(JsonNode root) {
        requireObject(root, ROOT_FIELDS, ROOT_FIELDS, "최상위 항목");
        if (!integer(root.get("schemaVersion"), SCHEMA_VERSION, SCHEMA_VERSION)) throw invalid("지원하지 않는 액세서리 스키마 버전입니다.");
        String revision = text(root.get("revision"), "카탈로그 revision", 80);
        if (!REVISION.matcher(revision).matches()) throw invalid("카탈로그 revision 형식이 올바르지 않습니다.");
        JsonNode values = root.get("items");
        if (values == null || !values.isArray() || values.isEmpty() || values.size() > 1000) throw invalid("액세서리 items 수가 올바르지 않습니다.");

        var items = new ArrayList<Item>();
        var ids = new HashSet<String>();
        for (JsonNode value : values) {
            requireObject(value, ITEM_REQUIRED, ITEM_ALLOWED, "액세서리");
            String id = text(value.get("id"), "액세서리 ID", 40);
            if (!ID.matcher(id).matches() || id.equals("none") || !ids.add(id)) throw invalid("액세서리 ID가 잘못되었거나 중복되었습니다.");
            String label = text(value.get("label"), "액세서리 이름", 80);
            String availability = exact(value.get("availability"), AVAILABILITIES, "availability");
            String slot = exact(value.get("slot"), SLOTS, "slot");
            String layer = exact(value.get("layer"), LAYERS, "layer");
            String renderer = exact(value.get("renderer"), RENDERERS, "renderer");
            String itemRevision = revision(value.get("revision"));
            String emoji = optionalText(value.get("emoji"), "emoji", 16);

            Grade grade = null;
            Integer weight = null;
            if (availability.equals("paid")) {
                if (!value.has("grade") || !value.has("weight")) throw invalid("유료 액세서리에는 grade와 weight가 필요합니다.");
                try { grade = Grade.valueOf(text(value.get("grade"), "grade", 3)); }
                catch (IllegalArgumentException error) { throw invalid("유료 액세서리 grade가 올바르지 않습니다."); }
                if (grade == Grade.N) throw invalid("유료 액세서리 grade는 R 이상이어야 합니다.");
                if (!integer(value.get("weight"), 0, 1_000_000)) throw invalid("유료 액세서리 weight가 올바르지 않습니다.");
                weight = value.get("weight").intValue();
            } else if (value.has("grade") || value.has("weight")) {
                throw invalid("무료 액세서리에는 유료 뽑기 정보가 들어갈 수 없습니다.");
            }

            Asset asset = value.has("asset") ? asset(value.get("asset"), id) : null;
            if (renderer.equals("image") && asset == null) throw invalid("이미지 액세서리에는 검증 가능한 asset이 필요합니다.");
            if (renderer.equals("image") && availability.equals("paid") && weight != 0)
                throw invalid("새 유료 이미지 액세서리는 관리자 활성화 전 weight 0이어야 합니다.");
            if (renderer.equals("builtin") && !LEGACY_BUILTINS.contains(id)) throw invalid("새 액세서리는 image renderer와 검증된 PNG를 사용해야 합니다.");
            Transform transform = value.has("defaultTransform") ? transform(value.get("defaultTransform")) : new Transform(0, 0, 1, 1, 0, false);
            items.add(new Item(id, label, emoji, availability, slot, layer, renderer, itemRevision, grade, weight, asset, transform));
        }
        requireLegacy(items, LEGACY_FREE, "free");
        requireLegacy(items, LEGACY_PAID, "paid");
        if (items.stream().filter(Item::paid).mapToLong(Item::weight).sum() <= 0) throw invalid("유료 액세서리 기본 가중치 합계가 0입니다.");
        return new Parsed(revision, List.copyOf(items));
    }

    private static Asset asset(JsonNode value, String id) {
        requireObject(value, ASSET_FIELDS, ASSET_FIELDS, "asset");
        String png = text(value.get("png"), "asset.png", 180);
        if (!png.equals("/images/ruby-round-v1/accessories/" + id + ".png")) throw invalid("asset.png 경로가 액세서리 ID와 일치하지 않습니다.");
        String sha256 = text(value.get("sha256"), "asset.sha256", 64);
        if (!SHA256.matcher(sha256).matches()) throw invalid("asset.sha256 형식이 올바르지 않습니다.");
        if (!integer(value.get("width"), 1, 2048) || !integer(value.get("height"), 1, 2048)) throw invalid("asset 크기가 올바르지 않습니다.");
        int width = value.get("width").intValue(), height = value.get("height").intValue();
        double pivotX = finite(value.get("pivotX"), 0, width, "asset.pivotX");
        double pivotY = finite(value.get("pivotY"), 0, height, "asset.pivotY");
        return new Asset(png, sha256, width, height, pivotX, pivotY);
    }

    private static Transform transform(JsonNode value) {
        requireObject(value, Set.of(), TRANSFORM_FIELDS, "defaultTransform");
        double offsetX = optionalFinite(value.get("offsetX"), -512, 512, 0, "defaultTransform.offsetX");
        double offsetY = optionalFinite(value.get("offsetY"), -512, 512, 0, "defaultTransform.offsetY");
        double scaleX = optionalFinite(value.get("scaleX"), .05, 2, 1, "defaultTransform.scaleX");
        double scaleY = optionalFinite(value.get("scaleY"), .05, 2, 1, "defaultTransform.scaleY");
        double rotation = optionalFinite(value.get("rotation"), -180, 180, 0, "defaultTransform.rotation");
        boolean flipX = false;
        if (value.has("flipX")) {
            if (!value.get("flipX").isBoolean()) throw invalid("defaultTransform.flipX 형식이 올바르지 않습니다.");
            flipX = value.get("flipX").booleanValue();
        }
        return new Transform(offsetX, offsetY, scaleX, scaleY, rotation, flipX);
    }

    private static void requireLegacy(List<Item> items, Set<String> required, String availability) {
        Set<String> actual = new HashSet<>();
        items.stream().filter(item -> item.availability().equals(availability)).forEach(item -> actual.add(item.id()));
        if (!actual.containsAll(required)) throw invalid("기존 저장 ID와 호환되는 " + availability + " 액세서리가 빠졌습니다.");
    }

    private static void requireObject(JsonNode value, Set<String> required, Set<String> allowed, String label) {
        if (value == null || !value.isObject()) throw invalid(label + " 형식이 올바르지 않습니다.");
        Set<String> fields = new HashSet<>(value.propertyNames());
        if (!fields.containsAll(required) || !allowed.containsAll(fields)) throw invalid(label + " 필드를 확인해 주세요.");
    }

    private static String exact(JsonNode value, Set<String> allowed, String label) {
        String result = text(value, label, 24);
        if (!allowed.contains(result)) throw invalid(label + " 값이 올바르지 않습니다.");
        return result;
    }

    private static String text(JsonNode value, String label, int maxLength) {
        if (value == null || !value.isTextual()) throw invalid(label + " 형식이 올바르지 않습니다.");
        String result = value.textValue();
        if (result == null || result.isBlank() || !result.equals(result.strip()) || result.codePointCount(0, result.length()) > maxLength
            || result.codePoints().anyMatch(Character::isISOControl)) throw invalid(label + " 값이 올바르지 않습니다.");
        return result;
    }

    private static String optionalText(JsonNode value, String label, int maxLength) {
        return value == null ? null : text(value, label, maxLength);
    }

    private static String revision(JsonNode value) {
        String result;
        if (value != null && value.isTextual()) result = value.textValue();
        else if (integer(value, 1, 1_000_000)) result = Integer.toString(value.intValue());
        else throw invalid("액세서리 revision 형식이 올바르지 않습니다.");
        if (!REVISION.matcher(result).matches()) throw invalid("액세서리 revision 값이 올바르지 않습니다.");
        return result;
    }

    private static boolean integer(JsonNode value, int min, int max) {
        return value != null && value.isIntegralNumber() && value.canConvertToInt() && value.intValue() >= min && value.intValue() <= max;
    }

    private static double finite(JsonNode value, double min, double max, String label) {
        if (value == null || !value.isNumber()) throw invalid(label + " 형식이 올바르지 않습니다.");
        double result = value.doubleValue();
        if (!Double.isFinite(result) || result < min || result > max) throw invalid(label + " 값이 올바르지 않습니다.");
        return result;
    }

    private static double optionalFinite(JsonNode value, double min, double max, double fallback, String label) {
        return value == null ? fallback : finite(value, min, max, label);
    }

    private static IllegalStateException invalid(String message) { return new IllegalStateException(message); }
}
