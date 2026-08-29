package com.routeledger.security;

import com.routeledger.domain.Role;

/**
 * The authenticated caller, rebuilt from the JWT on every request. Carries the tenant id so
 * no service ever has to trust a business id coming from the request body.
 */
public record AuthPrincipal(Long userId,
                            Long businessId,
                            String email,
                            String name,
                            Role role) {

    public boolean isAgent() {
        return role == Role.AGENT;
    }

    public boolean canManage() {
        return role == Role.OWNER || role == Role.MANAGER;
    }
}
