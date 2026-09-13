package com.puppyruby.seo;

import jakarta.persistence.*;
import java.util.LinkedHashMap;
import java.util.Map;

@Entity
@Table(name = "seo_settings")
class SeoSettings {
    static final String ID = "global";
    @Id @Column(length = 16) String id = ID;
    @Column(nullable = false, length = 120) String siteName = SeoService.DEFAULT_SITE_NAME;
    @Column(nullable = false, length = 300) String siteUrl = "";
    @Column(nullable = false, length = 200) String defaultTitle = SeoService.DEFAULT_TITLE;
    @Column(nullable = false, length = 600) String defaultDescription = SeoService.DEFAULT_DESCRIPTION;
    @Column(nullable = false, length = 2048) String ogImageUrl = "";
    @Column(nullable = false, length = 320) String ogImageAlt = "";
    @Column(nullable = false, length = 200) String googleVerification = "";
    @Column(nullable = false, length = 200) String naverVerification = "";
    @Column(nullable = false) boolean indexingEnabled = true;
    @ElementCollection
    @CollectionTable(name = "seo_pages", joinColumns = @JoinColumn(name = "settings_id"))
    @MapKeyColumn(name = "page_key", length = 16)
    Map<String, SeoPage> pages = new LinkedHashMap<>();
    @Column(nullable = false) long revision;
    Long updatedAt;
    @Version Long rowVersion;
    protected SeoSettings() { SeoService.defaultPages().forEach((key, page) -> pages.put(key, new SeoPage(page))); }
}

@Embeddable
class SeoPage {
    @Column(nullable = false, length = 200) String title;
    @Column(nullable = false, length = 600) String description;
    @Column(nullable = false) boolean indexable;
    protected SeoPage() {}
    SeoPage(SeoService.Page page) { title = page.title(); description = page.description(); indexable = page.indexable(); }
    SeoService.Page view() { return new SeoService.Page(title, description, indexable); }
}
