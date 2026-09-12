package com.puppyruby.admin;

import com.puppyruby.auth.AuthService;
import com.puppyruby.commerce.CommerceCatalogService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;

@Service
public class AdminCommerceService {
    private final AuthService auth;
    private final CommerceCatalogService catalog;
    private final AdminAuditRepository audits;
    AdminCommerceService(AuthService auth, CommerceCatalogService catalog, AdminAuditRepository audits) { this.auth = auth; this.catalog = catalog; this.audits = audits; }
    @Transactional(readOnly = true) public CommerceCatalogService.Catalog current(String token) { auth.requireAdmin(token); return catalog.current(); }
    @Transactional public CommerceCatalogService.Catalog save(String token, Map<String, Object> body) {
        var actor = auth.requireAdmin(token); var result = catalog.update(body);
        audits.save(new AdminAudit(actor.id, "COMMERCE", "catalog", "COMMERCE_CATALOG_UPDATE", "뽑기 상품·확률 설정 저장: 버전 " + result.revision() + ", 판매 " + result.salesEnabled()));
        return result;
    }
}
