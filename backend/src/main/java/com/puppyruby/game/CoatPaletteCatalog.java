package com.puppyruby.game;

import tools.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.Set;

/** Persist the existing fur IDs; adding palettes does not require a schema change. */
public final class CoatPaletteCatalog {
    private static final Set<String> IDS = load();
    private CoatPaletteCatalog() {}
    public static boolean contains(String id) { return id != null && IDS.contains(id); }
    private static Set<String> load() {
        try (var input = CoatPaletteCatalog.class.getResourceAsStream("/coat-palettes.json")) {
            if (input == null) throw new IllegalStateException("Missing coat palette catalog");
            var root = new ObjectMapper().readTree(input);
            if (root.path("schemaVersion").asInt() != 1 || !root.path("items").isArray()) throw new IllegalStateException("Invalid coat palette catalog");
            var ids = new HashSet<String>();
            for (var item : root.path("items")) {
                String id = item.path("id").asString();
                if (!id.matches("[a-z0-9-]{1,40}") || !ids.add(id) || item.path("label").asString().isBlank()) throw new IllegalStateException("Invalid coat palette ID");
                for (String role : new String[]{"primary", "secondary"}) {
                    var colors = item.path(role);
                    if (!colors.isArray() || colors.size() != 3) throw new IllegalStateException("Invalid coat palette ramp");
                    for (var color : colors) if (!color.asString().matches("#[a-fA-F0-9]{6}")) throw new IllegalStateException("Invalid coat palette color");
                }
            }
            if (!ids.containsAll(Set.of("original", "cream", "chocolate", "rose", "silver"))) throw new IllegalStateException("Legacy coat IDs are required");
            return Set.copyOf(ids);
        } catch (Exception e) { throw new IllegalStateException("Cannot load shared coat palettes", e); }
    }
}
