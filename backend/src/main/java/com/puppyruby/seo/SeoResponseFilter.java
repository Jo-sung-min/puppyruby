package com.puppyruby.seo;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

@Component
class SeoResponseFilter extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String route = request.getRequestURI().substring(request.getContextPath().length());
        if (route.equals("/api/v1/seo") || route.equals("/api/v1/admin/seo")) {
            response.setHeader("Cache-Control", "no-store"); response.setHeader("Pragma", "no-cache");
        }
        chain.doFilter(request, response);
    }
}
