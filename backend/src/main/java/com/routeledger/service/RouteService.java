package com.routeledger.service;

import com.routeledger.domain.Route;
import com.routeledger.domain.User;
import com.routeledger.dto.AuthDtos;
import com.routeledger.dto.RouteDtos;
import com.routeledger.exception.BadRequestException;
import com.routeledger.exception.ConflictException;
import com.routeledger.exception.NotFoundException;
import com.routeledger.repository.CustomerRepository;
import com.routeledger.repository.RouteRepository;
import com.routeledger.repository.UserRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.routeledger.domain.Role;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Beats (routes). Each one owns a depot, which is where every optimised tour starts. */
@Service
public class RouteService {

    private final RouteRepository routes;
    private final UserRepository users;
    private final CustomerRepository customers;
    private final PasswordEncoder encoder;

    public RouteService(RouteRepository routes, UserRepository users, CustomerRepository customers,
                        PasswordEncoder encoder) {
        this.routes = routes;
        this.users = users;
        this.customers = customers;
        this.encoder = encoder;
    }

    @Transactional(readOnly = true)
    public List<RouteDtos.RouteView> list(Long businessId, boolean activeOnly) {
        List<Route> found = activeOnly
                ? routes.findByBusinessIdAndActiveTrueOrderByNameAsc(businessId)
                : routes.findByBusinessIdOrderByNameAsc(businessId);
        Map<Long, String> agents = agentNames(businessId);
        List<RouteDtos.RouteView> views = new ArrayList<>(found.size());
        for (Route route : found) {
            views.add(toView(route, agents));
        }
        return views;
    }

    @Transactional(readOnly = true)
    public RouteDtos.RouteView get(Long businessId, Long id) {
        return toView(require(businessId, id), agentNames(businessId));
    }

    /**
     * Everyone on the payroll, so the beat editor can offer a picker instead of asking an owner to
     * type a numeric agent id. Deliberately exposes no password material.
     */
    @Transactional(readOnly = true)
    public List<AuthDtos.UserView> staff(Long businessId) {
        List<User> found = users.findByBusinessIdOrderByNameAsc(businessId);
        List<AuthDtos.UserView> views = new ArrayList<>(found.size());
        for (User user : found) {
            views.add(new AuthDtos.UserView(user.getId(), user.getName(), user.getEmail(),
                    user.getPhone(), user.getRole().name(), user.isEmailVerified()));
        }
        return views;
    }

    @Transactional
    public AuthDtos.UserView createStaff(Long businessId, AuthDtos.CreateStaffRequest request) {
        String email = request.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(email)) {
            throw new ConflictException("A user with email '" + email + "' already exists.");
        }
        Role role;
        try {
            role = Role.valueOf(request.role().trim().toUpperCase());
        } catch (Exception e) {
            role = Role.AGENT;
        }

        User user = new User();
        user.setBusinessId(businessId);
        user.setName(request.name().trim());
        user.setEmail(email);
        user.setPhone(request.phone().trim());
        user.setPasswordHash(encoder.encode(request.password()));
        user.setRole(role);
        user.setActive(true);
        user.setEmailVerified(true);
        User saved = users.save(user);

        return new AuthDtos.UserView(saved.getId(), saved.getName(), saved.getEmail(),
                saved.getPhone(), saved.getRole().name(), saved.isEmailVerified());
    }

    @Transactional
    public void deleteStaff(Long businessId, Long staffId) {
        User user = users.findByIdAndBusinessId(staffId, businessId)
                .orElseThrow(() -> NotFoundException.of("Staff user", staffId));

        // Unassign from routes
        List<Route> assignedRoutes = routes.findByBusinessIdOrderByNameAsc(businessId);
        for (Route r : assignedRoutes) {
            if (staffId.equals(r.getAgentId())) {
                r.setAgentId(null);
                routes.save(r);
            }
        }

        users.delete(user);
    }

    @Transactional(readOnly = true)
    public Route require(Long businessId, Long id) {
        return routes.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> NotFoundException.of("Route", id));
    }

    @Transactional
    public RouteDtos.RouteView create(Long businessId, RouteDtos.RouteRequest request) {
        String name = request.name().trim();
        if (routes.existsByBusinessIdAndNameIgnoreCase(businessId, name)) {
            throw new ConflictException("A route called '" + name + "' already exists.");
        }
        Route route = new Route();
        route.setBusinessId(businessId);
        apply(route, request, businessId);
        routes.save(route);
        return toView(route, agentNames(businessId));
    }

    @Transactional
    public RouteDtos.RouteView update(Long businessId, Long id, RouteDtos.RouteRequest request) {
        Route route = require(businessId, id);
        String name = request.name().trim();
        if (!route.getName().equalsIgnoreCase(name)
                && routes.existsByBusinessIdAndNameIgnoreCase(businessId, name)) {
            throw new ConflictException("A route called '" + name + "' already exists.");
        }
        apply(route, request, businessId);
        routes.save(route);
        return toView(route, agentNames(businessId));
    }

    @Transactional
    public RouteDtos.RouteView setActive(Long businessId, Long id, boolean active) {
        Route route = require(businessId, id);
        route.setActive(active);
        routes.save(route);
        return toView(route, agentNames(businessId));
    }

    private void apply(Route route, RouteDtos.RouteRequest request, Long businessId) {
        route.setName(request.name().trim());
        if (request.agentId() != null) {
            User agent = users.findByIdAndBusinessId(request.agentId(), businessId)
                    .orElseThrow(() -> new BadRequestException(
                            "Agent " + request.agentId() + " is not part of this business."));
            route.setAgentId(agent.getId());
        } else {
            route.setAgentId(null);
        }
        route.setDepotLabel(request.depotLabel() == null || request.depotLabel().isBlank()
                ? request.name().trim() + " depot"
                : request.depotLabel().trim());
        route.setDepotLat(request.depotLat());
        route.setDepotLng(request.depotLng());
        if (request.active() != null) {
            route.setActive(request.active());
        }
    }

    private Map<Long, String> agentNames(Long businessId) {
        Map<Long, String> names = new HashMap<>();
        for (User user : users.findByBusinessIdOrderByNameAsc(businessId)) {
            names.put(user.getId(), user.getName());
        }
        return names;
    }

    private RouteDtos.RouteView toView(Route route, Map<Long, String> agents) {
        long count = customers.countByBusinessIdAndRouteIdAndActiveTrue(route.getBusinessId(), route.getId());
        return new RouteDtos.RouteView(route.getId(), route.getName(), route.getAgentId(),
                route.getAgentId() == null ? null : agents.get(route.getAgentId()),
                route.getDepotLabel(), route.getDepotLat(), route.getDepotLng(),
                route.isActive(), count);
    }
}
