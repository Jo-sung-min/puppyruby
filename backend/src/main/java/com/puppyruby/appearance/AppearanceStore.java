package com.puppyruby.appearance;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Creation has its own transaction, so a competing first insert cannot poison a caller's save transaction. */
@Component
class AppearanceStore {
    private final AppearanceRepository repository;
    private final TransactionTemplate creation;
    AppearanceStore(AppearanceRepository repository, PlatformTransactionManager transactions) {
        this.repository = repository;
        creation = new TransactionTemplate(transactions);
        creation.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    void ensureExists() {
        try {
            creation.executeWithoutResult(transaction -> {
                if (!repository.existsById(AppearanceSettings.ID)) repository.saveAndFlush(new AppearanceSettings());
            });
        } catch (DataIntegrityViolationException collision) {
            // Another transaction may have committed the same singleton while this insert waited.
            if (!repository.existsById(AppearanceSettings.ID)) throw collision;
        }
    }
}
