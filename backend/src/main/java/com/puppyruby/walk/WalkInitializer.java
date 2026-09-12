package com.puppyruby.walk;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
class WalkInitializer implements ApplicationRunner {
    private final WalkService service;
    WalkInitializer(WalkService service) { this.service = service; }
    @Override public void run(ApplicationArguments args) { service.initialize(); }
}
