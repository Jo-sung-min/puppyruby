package com.puppyruby.admin;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

interface AdminAuditRepository extends JpaRepository<AdminAudit, String> {
    List<AdminAudit> findByTargetIdOrderByCreatedAtAsc(String targetId);
}
