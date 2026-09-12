package com.puppyruby.commerce;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;

@Component
class CommerceStore {
    private final CommerceSettingsRepository settings;
    private final TransactionTemplate creation;
    CommerceStore(CommerceSettingsRepository settings, PlatformTransactionManager transactions) {
        this.settings = settings; creation = new TransactionTemplate(transactions);
        creation.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    CommerceSettings lock() {
        try {
            creation.executeWithoutResult(status -> {
                if (!settings.existsById(CommerceSettings.ID)) settings.saveAndFlush(new CommerceSettings());
            });
        } catch (DataIntegrityViolationException collision) {
            if (!settings.existsById(CommerceSettings.ID)) throw collision;
        }
        return settings.findLocked().orElseThrow();
    }
}
