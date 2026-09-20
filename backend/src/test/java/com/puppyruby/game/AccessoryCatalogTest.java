package com.puppyruby.game;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

class AccessoryCatalogTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test void loadsTheSharedLegacyContractAndPaidDrawMetadata() {
        var catalog = new AccessoryCatalog(mapper);
        assertEquals("accessories-2026-09-19-1", catalog.revision());
        assertTrue(catalog.free().stream().map(AccessoryCatalog.Item::id).collect(Collectors.toSet())
            .containsAll(Set.of("ribbon", "scarf", "crown")));
        assertTrue(catalog.paid().stream().map(AccessoryCatalog.Item::id).collect(Collectors.toSet())
            .containsAll(Set.of("bow-blue", "bow-lilac", "party-hat", "flower", "glasses", "halo", "angel-wings")));
        Map<String, Integer> weights = catalog.paid().stream().collect(Collectors.toMap(AccessoryCatalog.Item::id, AccessoryCatalog.Item::weight));
        Map<String, Grade> grades = catalog.paid().stream().collect(Collectors.toMap(AccessoryCatalog.Item::id, AccessoryCatalog.Item::grade));
        Map.of("bow-blue", 30, "bow-lilac", 25, "party-hat", 20, "flower", 12, "glasses", 8, "halo", 4, "angel-wings", 1)
            .forEach((id, weight) -> assertEquals(weight, weights.get(id)));
        Map.of("bow-blue", Grade.R, "bow-lilac", Grade.R, "party-hat", Grade.R, "flower", Grade.SR,
                "glasses", Grade.SR, "halo", Grade.SSR, "angel-wings", Grade.SSR)
            .forEach((id, grade) -> assertEquals(grade, grades.get(id)));
        assertTrue(catalog.isFree("ribbon")); assertFalse(catalog.isPaid("ribbon"));
        assertTrue(catalog.isPaid("angel-wings")); assertFalse(catalog.find("none").isPresent());
    }

    @Test void acceptsANewVerifiedImageOverlayWithoutChangingLegacyIds() {
        String added = addItem(source(), """
          {
            "id":"star-pin","label":"별 핀","availability":"paid","slot":"head","layer":"front",
            "renderer":"image","revision":"asset-1","grade":"SR","weight":0,
            "asset":{"png":"/images/ruby-round-v1/accessories/star-pin.png","sha256":"%s","width":64,"height":48,"pivotX":32,"pivotY":24},
            "defaultTransform":{"offsetX":1.5,"offsetY":-2,"scaleX":1.25,"scaleY":0.8,"rotation":12,"flipX":true}
          }
          """.formatted("a".repeat(64)));
        var item = new AccessoryCatalog(mapper, added).find("star-pin").orElseThrow();
        assertEquals("image", item.renderer()); assertEquals(0, item.weight()); assertEquals(64, item.asset().width());
        assertEquals(1.5, item.defaultTransform().offsetX()); assertTrue(item.defaultTransform().flipX());
    }

    @Test void malformedOrIncompatibleCatalogsFailClosed() {
        String valid = source();
        for (String invalid : List.of(
            valid.replaceFirst("\\{", "{\"unexpected\":true,"),
            valid.replaceFirst("\"id\": \"scarf\"", "\"id\": \"ribbon\""),
            valid.replaceFirst("\"availability\": \"free\",", "\"availability\": \"free\",\n      \"grade\": \"R\","),
            valid.replaceFirst("\"renderer\": \"builtin\"", "\"renderer\": \"image\""),
            valid.replaceFirst("\"id\": \"bow-blue\"", "\"id\": \"new-builtin\""),
            addItem(valid, "{\"id\":\"paid-too-early\",\"label\":\"미리 활성화\",\"availability\":\"paid\",\"slot\":\"head\",\"layer\":\"front\",\"renderer\":\"image\",\"revision\":\"1\",\"grade\":\"R\",\"weight\":1,\"asset\":{\"png\":\"/images/ruby-round-v1/accessories/paid-too-early.png\",\"sha256\":\"" + "a".repeat(64) + "\",\"width\":32,\"height\":32,\"pivotX\":16,\"pivotY\":16}}"),
            addItem(valid, "{\"id\":\"bad-image\",\"label\":\"잘못된 이미지\",\"availability\":\"paid\",\"slot\":\"head\",\"layer\":\"front\",\"renderer\":\"image\",\"revision\":\"1\",\"grade\":\"R\",\"weight\":1,\"asset\":{\"png\":\"https://attacker.example/a.png\",\"sha256\":\"" + "a".repeat(64) + "\",\"width\":32,\"height\":32,\"pivotX\":16,\"pivotY\":16}}")
        )) assertThrows(IllegalStateException.class, () -> new AccessoryCatalog(mapper, invalid));
    }

    private String source() {
        try (var input = AccessoryCatalog.class.getResourceAsStream("/accessories.json")) {
            assertNotNull(input); return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException error) { throw new AssertionError(error); }
    }

    private static String addItem(String source, String item) {
        int end = source.lastIndexOf(']');
        if (end < 0) throw new AssertionError("items array missing");
        return source.substring(0, end).stripTrailing() + ",\n" + item.strip() + "\n" + source.substring(end);
    }
}
