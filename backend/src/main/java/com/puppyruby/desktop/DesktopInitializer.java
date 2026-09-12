package com.puppyruby.desktop;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
class DesktopInitializer implements ApplicationRunner {
    private final DesktopService service;
    DesktopInitializer(DesktopService service) { this.service = service; }
    @Override public void run(ApplicationArguments args) { service.initialize(); }
}
