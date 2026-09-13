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
        String deleted = result.deletedStyles().size() <= 8 ? result.deletedStyles().toString()
            : result.deletedStyles().subList(0, 8) + " 외 " + (result.deletedStyles().size() - 8) + "개";
        String reason = "도트 스타일 설정 저장: 버전 " + input.expectedRevision() + " → " + result.revision()
            + ", 기본 " + result.defaultStyle() + ", 품종별 " + result.breedStyles() + ", 삭제 " + deleted
            + ", 세부 타입 " + result.varieties().size() + "개, 적용 " + result.breedVarieties().size() + "견종, 이름 "
            + result.varieties().stream().limit(3).map(AppearanceService.Variety::name).toList();
        if (reason.length() > 600) reason = reason.substring(0, Character.isHighSurrogate(reason.charAt(599)) ? 599 : 600);
        audits.save(new AdminAudit(actor.id, "APPEARANCE", "global", "APPEARANCE_UPDATE",
            reason));
        return result;
    }
}
