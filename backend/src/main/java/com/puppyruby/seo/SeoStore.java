package com.puppyruby.seo;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;

@Component
class SeoStore {
    private final SeoRepository repository;
    private final TransactionTemplate creation;
    SeoStore(SeoRepository repository, PlatformTransactionManager transactions) {
        this.repository = repository; creation = new TransactionTemplate(transactions);
        creation.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    void ensureExists() {
        try {
            creation.executeWithoutResult(transaction -> {
                if (!repository.existsById(SeoSettings.ID)) repository.saveAndFlush(new SeoSettings());
            });
        } catch (DataIntegrityViolationException collision) {
            if (!repository.existsById(SeoSettings.ID)) throw collision;
        }
    }
}
