package com.puppyruby.auth;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
class AuthInitializer implements ApplicationRunner {
    private final AuthService auth;
    AuthInitializer(AuthService auth) { this.auth = auth; }
    @Override public void run(ApplicationArguments args) { auth.initialize(); }
}
