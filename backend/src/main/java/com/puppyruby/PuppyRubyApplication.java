package com.puppyruby;

import java.nio.file.Path;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class PuppyRubyApplication {
    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(PuppyRubyApplication.class);
        BackendEnvironment.configure(application, Path.of(""));
        application.run(args);
    }
}
