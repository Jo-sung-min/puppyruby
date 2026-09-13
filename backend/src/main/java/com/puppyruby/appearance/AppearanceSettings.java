package com.puppyruby.appearance;

import jakarta.persistence.*;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.List;
import java.util.ArrayList;

@Entity
@Table(name = "appearance_settings")
class AppearanceSettings {
    static final String ID = "global";
    @Id @Column(length = 16) String id = ID;
    @Column(nullable = false, length = 24) String defaultStyle = "classic";
    @ElementCollection
    @CollectionTable(name = "appearance_breed_styles", joinColumns = @JoinColumn(name = "settings_id"))
    @MapKeyColumn(name = "breed", length = 24)
    @Column(name = "style", nullable = false, length = 24)
    Map<String, String> breedStyles = new LinkedHashMap<>();
    @ElementCollection
    @CollectionTable(name = "appearance_deleted_styles", joinColumns = @JoinColumn(name = "settings_id"),
        uniqueConstraints = @UniqueConstraint(columnNames = {"settings_id", "style"}))
    @Column(name = "style", nullable = false, length = 24)
    Set<String> deletedStyles = new LinkedHashSet<>();
    @ElementCollection
    @CollectionTable(name = "appearance_varieties", joinColumns = @JoinColumn(name = "settings_id"))
    @OrderColumn(name = "position")
    List<AppearanceVariety> varieties = new ArrayList<>();
    @ElementCollection
    @CollectionTable(name = "appearance_breed_varieties", joinColumns = @JoinColumn(name = "settings_id"))
    @MapKeyColumn(name = "breed", length = 24)
    @Column(name = "variety_id", nullable = false, length = 36)
    Map<String, String> breedVarieties = new LinkedHashMap<>();
    @Column(nullable = false) long revision;
    Long updatedAt;
    @Version Long rowVersion;
    protected AppearanceSettings() {}
}

@Embeddable
class AppearanceVariety {
    @Column(name = "variety_id", nullable = false, length = 36) String id;
    @Column(name = "breed", nullable = false, length = 24) String breed;
    @Column(name = "name", nullable = false, length = 48) String name;
    @Column(name = "style", length = 24) String style;
    @Column(name = "shape", nullable = false, length = 16) String shape;
    @Column(name = "pattern", nullable = false, length = 16) String pattern;
    @Column(name = "coat_color", length = 7) String coatColor;
    @Column(name = "pattern_color", nullable = false, length = 7) String patternColor;
    protected AppearanceVariety() {}
    AppearanceVariety(AppearanceService.Variety value) {
        id = value.id(); breed = value.breed(); name = value.name(); style = value.style(); shape = value.shape();
        pattern = value.pattern(); coatColor = value.coatColor(); patternColor = value.patternColor();
    }
    AppearanceService.Variety view() { return new AppearanceService.Variety(id, breed, name, style, shape, pattern, coatColor, patternColor); }
}
