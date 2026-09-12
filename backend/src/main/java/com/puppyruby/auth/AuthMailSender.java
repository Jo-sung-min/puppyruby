package com.puppyruby.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
class AuthMailSender {
    private final boolean enabled;
    private final String from;
    private final JavaMailSenderImpl sender;
    AuthMailSender(@Value("${MAIL_ENABLED:false}") boolean enabled,
                   @Value("${MAIL_HOST:}") String host, @Value("${MAIL_PORT:587}") int port,
                   @Value("${MAIL_USERNAME:}") String username, @Value("${MAIL_PASSWORD:}") String password,
                   @Value("${MAIL_FROM:}") String from, @Value("${MAIL_STARTTLS:true}") boolean startTls) {
        this.enabled = enabled && !host.isBlank() && !from.isBlank(); this.from = from;
        sender = new JavaMailSenderImpl(); sender.setHost(host); sender.setPort(port);
        if (!username.isBlank()) { sender.setUsername(username); sender.setPassword(password); }
        sender.setDefaultEncoding("UTF-8");
        var properties = sender.getJavaMailProperties();
        properties.setProperty("mail.smtp.auth", Boolean.toString(!username.isBlank()));
        properties.setProperty("mail.smtp.starttls.enable", Boolean.toString(startTls));
        properties.setProperty("mail.smtp.starttls.required", Boolean.toString(startTls));
        properties.setProperty("mail.smtp.ssl.checkserveridentity", "true");
        properties.setProperty("mail.smtp.connectiontimeout", "5000");
        properties.setProperty("mail.smtp.timeout", "5000");
        properties.setProperty("mail.smtp.writetimeout", "5000");
    }
    boolean enabled() { return enabled; }
    void requireEnabled() {
        if (!enabled()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "메일 발송 설정이 아직 준비되지 않았어요. 운영자에게 문의해 주세요.");
    }
    void send(String email, boolean reset, String url) {
        requireEnabled();
        var message = new SimpleMailMessage(); message.setFrom(from); message.setTo(email);
        message.setSubject(reset ? "[퍼피루비] 비밀번호 다시 설정하기" : "[퍼피루비] 이메일 확인하기");
        message.setText((reset ? "아래 링크에서 30분 안에 새 비밀번호를 설정해 주세요.\n" : "아래 링크를 24시간 안에 눌러 이메일을 확인해 주세요.\n")
            + url + "\n\n요청하지 않았다면 이 메일을 무시해 주세요. 링크는 한 번만 사용할 수 있습니다.");
        try { sender.send(message); }
        catch (RuntimeException error) {
            // SMTP diagnostics may contain credentials or a token-bearing message; expose neither.
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
        }
    }
}
