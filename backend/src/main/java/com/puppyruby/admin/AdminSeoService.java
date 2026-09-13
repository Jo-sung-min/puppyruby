package com.puppyruby.admin;

import com.puppyruby.auth.AuthService;
import com.puppyruby.seo.SeoService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;

@Service
public class AdminSeoService {
    private final AuthService auth;
    private final SeoService seo;
    private final AdminAuditRepository audits;
    public AdminSeoService(AuthService auth, SeoService seo, AdminAuditRepository audits) { this.auth = auth; this.seo = seo; this.audits = audits; }
    @Transactional(readOnly = true)
    public SeoService.Config current(String token) { auth.requireAdmin(token); return seo.current(); }
    @Transactional
    public SeoService.Config save(String token, Map<String, Object> body) {
        var actor = auth.requireAdmin(token); var input = SeoService.parse(body); var result = seo.update(input);
        audits.save(new AdminAudit(actor.id, "SEO", "global", "SEO_UPDATE", "검색 설정 저장: 버전 " + input.expectedRevision() + " → " + result.revision()
            + ", 사이트 " + result.siteName() + ", 검색 노출 " + result.indexingEnabled() + ", 페이지 " + result.pages().keySet()));
        return result;
    }
}
