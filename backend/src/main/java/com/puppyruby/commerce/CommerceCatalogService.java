package com.puppyruby.commerce;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.math.*;
import java.util.*;

@Service
public class CommerceCatalogService {
    private final CommerceSettingsRepository settings;
    private final CommerceStore store;
    private final ObjectMapper mapper;
    CommerceCatalogService(CommerceSettingsRepository settings, CommerceStore store, ObjectMapper mapper) {
        this.settings = settings; this.store = store; this.mapper = mapper;
    }
    public record Product(String id, String kind, String name, int quantity, int price, boolean enabled) {}
    public record Entry(String id, String label, String grade, Integer breed, String itemId, int weight, String probability) {}
    public record Pool(String kind, String name, List<Entry> entries) {}
    public record Catalog(long revision, Long updatedAt, boolean salesEnabled, List<Product> products, List<Pool> pools) {}

    @Transactional(readOnly = true)
    public Catalog current() { return view(settings.findById(CommerceSettings.ID).orElseGet(CommerceSettings::new)); }
    @Transactional
    public Catalog update(Map<String, Object> body) {
        Map<?, ?> input = CommerceInput.fields(body, "expectedRevision", "salesEnabled", "products", "pools");
        long expected = CommerceInput.integer(input.get("expectedRevision"), 0, CommerceInput.MAX_SAFE);
        boolean enabled = CommerceInput.bool(input.get("salesEnabled"));
        Map<String, Object> products = new LinkedHashMap<>();
        for (Object raw : CommerceInput.list(input.get("products"), CommerceDefinitions.PRODUCTS.size())) {
            Map<?, ?> item = CommerceInput.fields(raw, "id", "price", "enabled");
            String id = CommerceInput.text(item.get("id"));
            if (CommerceDefinitions.PRODUCTS.stream().noneMatch(product -> product.id().equals(id)) || products.containsKey(id)) throw CommerceInput.bad("상품 식별자를 확인해 주세요.");
            products.put(id, Map.of("price", CommerceInput.integer(item.get("price"), 100, 1_000_000), "enabled", CommerceInput.bool(item.get("enabled"))));
        }
        Map<String, Integer> weights = new LinkedHashMap<>(); Set<String> kinds = new HashSet<>();
        for (Object raw : CommerceInput.list(input.get("pools"), 3)) {
            Map<?, ?> pool = CommerceInput.fields(raw, "kind", "entries"); String kind = CommerceInput.kind(pool.get("kind"));
            if (!kinds.add(kind)) throw CommerceInput.bad("중복된 뽑기 종류예요.");
            var defined = CommerceDefinitions.ENTRIES.stream().filter(entry -> entry.kind().equals(kind)).toList();
            long total = 0;
            for (Object rawEntry : CommerceInput.list(pool.get("entries"), defined.size())) {
                Map<?, ?> entry = CommerceInput.fields(rawEntry, "id", "weight"); String id = CommerceInput.text(entry.get("id"));
                int weight = (int) CommerceInput.integer(entry.get("weight"), 0, 1_000_000);
                if (defined.stream().noneMatch(value -> value.id().equals(id)) || weights.putIfAbsent(id, weight) != null) throw CommerceInput.bad("확률 항목을 확인해 주세요.");
                total += weight;
            }
            if (total <= 0) throw CommerceInput.bad("각 뽑기에는 당첨 가능한 항목이 하나 이상 필요해요.");
        }
        CommerceSettings row = store.lock();
        if (row.revision != expected || row.revision >= CommerceInput.MAX_SAFE) throw CommerceInput.conflict("상품과 확률 설정이 변경되었어요. 최신 설정을 불러와 주세요.");
        row.productsJson = mapper.writeValueAsString(products); row.weightsJson = mapper.writeValueAsString(weights);
        row.salesEnabled = enabled; row.revision++; row.updatedAt = System.currentTimeMillis(); settings.flush();
        return view(row);
    }
    Catalog view(CommerceSettings row) {
        Map<?, ?> customProducts = mapper.readValue(row.productsJson, Map.class), customWeights = mapper.readValue(row.weightsJson, Map.class);
        List<Product> products = CommerceDefinitions.PRODUCTS.stream().map(definition -> {
            Map<?, ?> custom = customProducts.get(definition.id()) instanceof Map<?, ?> values ? values : Map.of();
            return new Product(definition.id(), definition.kind(), definition.name(), definition.quantity(),
                custom.get("price") instanceof Number price ? price.intValue() : definition.price(), !Boolean.FALSE.equals(custom.get("enabled")));
        }).toList();
        List<Pool> pools = new ArrayList<>();
        for (String kind : CommerceDefinitions.KINDS) {
            var entries = CommerceDefinitions.ENTRIES.stream().filter(entry -> entry.kind().equals(kind)).toList();
            long total = entries.stream().mapToLong(entry -> weight(customWeights, entry)).sum();
            pools.add(new Pool(kind, CommerceDefinitions.name(kind) + " 뽑기", entries.stream().map(entry -> {
                int weight = weight(customWeights, entry);
                String probability = BigDecimal.valueOf(weight).multiply(BigDecimal.valueOf(100)).divide(BigDecimal.valueOf(total), 6, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString() + "%";
                return new Entry(entry.id(), entry.label(), entry.grade(), entry.breed(), entry.itemId(), weight, probability);
            }).toList()));
        }
        return new Catalog(row.revision, row.updatedAt, row.salesEnabled, products, List.copyOf(pools));
    }
    private int weight(Map<?, ?> weights, CommerceDefinitions.Entry entry) { return weights.get(entry.id()) instanceof Number value ? value.intValue() : entry.weight(); }
}
