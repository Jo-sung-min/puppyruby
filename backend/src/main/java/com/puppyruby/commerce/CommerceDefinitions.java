package com.puppyruby.commerce;

import com.puppyruby.game.GameService;
import com.puppyruby.game.AccessoryCatalog;
import com.puppyruby.game.BreedCatalog;
import com.puppyruby.game.Grade;
import org.springframework.stereotype.Component;
import java.util.*;

@Component
public final class CommerceDefinitions {
    public static final List<String> KINDS = List.of("dog", "aura", "accessory");
    public static final List<String> AURAS = List.of("snow", "peach", "mint", "ocean", "lilac", "gold", "rainbow", "starlight");
    record Product(String id, String kind, String name, int quantity, int price) {}
    record Entry(String id, String kind, String label, String grade, Integer breed, String itemId, int weight) {}
    static final List<Product> PRODUCTS = products();
    private final List<Entry> entries;
    CommerceDefinitions(AccessoryCatalog accessories) { entries = entries(accessories); }
    List<Entry> entries() { return entries; }
    static String name(String kind) { return switch (kind) { case "dog" -> "강아지"; case "aura" -> "아우라"; case "accessory" -> "치장품"; default -> throw new IllegalArgumentException(); }; }
    private static List<Product> products() {
        List<Product> result = new ArrayList<>();
        for (String kind : KINDS) for (int quantity : List.of(1, 10))
            result.add(new Product(kind + "-" + quantity, kind, name(kind) + " 뽑기권 " + quantity + "매", quantity, quantity * (kind.equals("dog") ? 1500 : 1000)));
        return List.copyOf(result);
    }
    private static List<Entry> entries(AccessoryCatalog accessories) {
        List<Entry> result = new ArrayList<>();
        for (int breed = 0; breed < GameService.BREEDS.size(); breed++) for (Grade grade : Grade.values())
            // New breeds are available for administrators to enable without changing any existing paid odds.
            result.add(new Entry("dog-" + breed + "-" + grade, "dog", GameService.BREEDS.get(breed) + " " + grade, grade.name(), breed, null,
                breed < BreedCatalog.LEGACY_DRAW_BREED_COUNT ? grade.probability : 0));
        String[] auraNames = { "포근한 눈꽃", "복숭아 빛", "민트 산들바람", "푸른 바다", "라일락 향기", "황금빛", "무지개", "반짝이는 별빛" };
        int[] auraWeights = { 40, 25, 15, 10, 5, 3, 1, 1 };
        for (int index = 0; index < AURAS.size(); index++) result.add(new Entry("aura-" + AURAS.get(index), "aura", auraNames[index], index < 4 ? "R" : index < 7 ? "SR" : "SSR", null, AURAS.get(index), auraWeights[index]));
        for (var accessory : accessories.paid()) result.add(new Entry("accessory-" + accessory.id(), "accessory", accessory.label(),
            accessory.grade().name(), null, accessory.id(), accessory.weight()));
        return List.copyOf(result);
    }
}
