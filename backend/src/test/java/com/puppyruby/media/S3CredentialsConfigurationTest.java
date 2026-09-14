package com.puppyruby.media;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.mock.env.MockEnvironment;
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

class S3CredentialsConfigurationTest {
    private static final String ACCESS_KEY = "OFFLINE_TEST_ACCESS_KEY";
    private static final String SECRET_KEY = "offline-test-secret-not-a-real-credential";
    private static final String SESSION_TOKEN = "offline-test-session-token";

    @Test void missingOrPartialKeysKeepTheSdkCredentialChainWithoutResolvingIt() {
        String[][] incomplete = {
            {null, null, null}, {"", "", ""}, {" ", "\t", ""},
            {ACCESS_KEY, "", ""}, {"", SECRET_KEY, ""},
            {"", "", SESSION_TOKEN}, {ACCESS_KEY, "", SESSION_TOKEN}, {"", SECRET_KEY, SESSION_TOKEN}
        };
        for (String[] values : incomplete) {
            var provider = S3MediaObjectStore.credentialsProvider(values[0], values[1], values[2]);
            try (var defaults = assertInstanceOf(DefaultCredentialsProvider.class, provider)) {
                // Calling resolveCredentials here could contact metadata services; construction must stay offline.
                assertNotNull(defaults);
            }
        }
    }

    @Test void aCompletePairUsesBasicCredentialsAndAnOptionalTokenUsesSessionCredentials() {
        var basic = S3MediaObjectStore.credentialsProvider(ACCESS_KEY, SECRET_KEY, " ").resolveCredentials();
        assertEquals(ACCESS_KEY, basic.accessKeyId());
        assertEquals(SECRET_KEY, basic.secretAccessKey());
        assertFalse(basic instanceof AwsSessionCredentials);

        var session = assertInstanceOf(AwsSessionCredentials.class,
            S3MediaObjectStore.credentialsProvider(ACCESS_KEY, SECRET_KEY, SESSION_TOKEN).resolveCredentials());
        assertEquals(ACCESS_KEY, session.accessKeyId());
        assertEquals(SECRET_KEY, session.secretAccessKey());
        assertEquals(SESSION_TOKEN, session.sessionToken());
    }

    @Test void springPropertiesSupplyAnOfflineUploadSignatureIncludingTheSessionToken() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.setEnvironment(new MockEnvironment()
                .withProperty("AWS_ACCESS_KEY_ID", ACCESS_KEY)
                .withProperty("AWS_SECRET_ACCESS_KEY", SECRET_KEY)
                .withProperty("AWS_SESSION_TOKEN", SESSION_TOKEN));
            context.registerBean(MediaSettings.class, () -> new MediaSettings(true,
                "puppyruby-test", "ap-northeast-2", "puppyruby", "https://images.example.test", 300, 1048576));
            context.register(S3MediaObjectStore.class);
            context.refresh();

            var upload = new MediaUpload();
            upload.bucket = "puppyruby-test";
            upload.objectKey = "puppyruby/walk-profiles/test.png";
            upload.contentType = "image/png";
            upload.size = 123;
            upload.sha256 = Base64.getEncoder().encodeToString(new byte[32]);
            String url = URLDecoder.decode(context.getBean(S3MediaObjectStore.class).presign(upload, 300).url(), StandardCharsets.UTF_8);
            assertTrue(url.contains("X-Amz-Credential=" + ACCESS_KEY + "/"));
            assertTrue(url.contains("X-Amz-Security-Token=" + SESSION_TOKEN));
            assertTrue(url.contains("X-Amz-Signature="));
        }
    }
}
