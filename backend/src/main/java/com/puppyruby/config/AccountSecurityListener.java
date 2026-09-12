package com.puppyruby.config;

import com.puppyruby.auth.AccountCredentialsChanged;
import com.puppyruby.desktop.DesktopService;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class AccountSecurityListener {
    private final DesktopService desktop;
    public AccountSecurityListener(DesktopService desktop) { this.desktop = desktop; }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void credentialsChanged(AccountCredentialsChanged event) {
        desktop.revokePlayerDevices(event.playerId());
    }
}
