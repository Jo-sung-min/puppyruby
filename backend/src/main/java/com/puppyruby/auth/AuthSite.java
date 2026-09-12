package com.puppyruby.auth;

import java.net.URI;
import java.util.Locale;
import java.util.Set;

final class AuthSite {
    private AuthSite() {}
    static String origin(String value) {
        try {
            URI uri = URI.create(value); String scheme = uri.getScheme(); String host = uri.getHost();
            if (scheme == null || host == null) throw new IllegalArgumentException();
            scheme = scheme.toLowerCase(Locale.ROOT); host = host.toLowerCase(Locale.ROOT);
            boolean local = Set.of("localhost", "127.0.0.1", "::1", "[::1]").contains(host);
            if (!(scheme.equals("https") || (scheme.equals("http") && local))
                || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                || (uri.getRawPath() != null && !uri.getRawPath().isEmpty() && !uri.getRawPath().equals("/"))
                || uri.getPort() < -1 || uri.getPort() == 0 || uri.getPort() > 65535) throw new IllegalArgumentException();
            int port = uri.getPort();
            if ((scheme.equals("https") && port == 443) || (scheme.equals("http") && port == 80)) port = -1;
            if (host.indexOf(':') >= 0 && !host.startsWith("[")) host = "[" + host + "]";
            return scheme + "://" + host + (port == -1 ? "" : ":" + port);
        } catch (RuntimeException invalid) {
            throw new IllegalArgumentException("PUBLIC_SITE_URL must be an HTTPS origin or a loopback HTTP origin without a path, credentials, query, or fragment.");
        }
    }
}
