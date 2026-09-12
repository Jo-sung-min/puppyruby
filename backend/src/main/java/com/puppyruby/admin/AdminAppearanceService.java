package com.puppyruby.admin;

import com.puppyruby.appearance.AppearanceService;
import com.puppyruby.auth.AuthService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;

@Service
public class AdminAppearanceService {
    private final AuthService auth;
    private final AppearanceService appearance;
    private final AdminAuditRepository audits;
    public AdminAppearanceService(AuthService auth, AppearanceService appearance, AdminAuditRepository audits) {
        this.auth = auth; this.appearance = appearance; this.audits = audits;
    }
    @Transactional(readOnly = true)
    public AppearanceService.Config current(String token) {
        auth.requireAdmin(token);
        return appearance.current();
    }
    @Transactional
    public AppearanceService.Config save(String token, Map<String, Object> body) {
        var actor = auth.requireAdmin(token);
        var input = AppearanceService.parse(body);
        var result = appearance.update(input);
        audits.save(new AdminAudit(actor.id, "APPEARANCE", "global", "APPEARANCE_UPDATE",
            "도트 스타일 설정 저장: 버전 " + input.expectedRevision() + " → " + result.revision()
                + ", 기본 " + result.defaultStyle() + ", 품종별 " + result.breedStyles() + ", 삭제 " + result.deletedStyles()));
        return result;
    }
}
