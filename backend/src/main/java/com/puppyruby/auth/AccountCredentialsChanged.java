package com.puppyruby.auth;

/** Published inside the credential-change transaction; consumers must run after its commit. */
public record AccountCredentialsChanged(String playerId) {}
