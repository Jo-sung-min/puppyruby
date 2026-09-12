package com.puppyruby.appearance;

import jakarta.persistence.*;
import java.util.LinkedHashMap;
import java.util.Map;

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
    @Column(nullable = false) long revision;
    Long updatedAt;
    @Version Long rowVersion;
    protected AppearanceSettings() {}
}
