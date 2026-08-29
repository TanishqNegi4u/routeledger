package com.routeledger.controller;

import com.routeledger.domain.Route;
import com.routeledger.dto.RouteDtos;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class RouteControllerIsolationTest extends BaseMultiTenantControllerTest {

    @Test
    @DisplayName("User A cannot read, update, or deactivate Route belonging to Business B")
    void route_CrossTenant_Blocked() throws Exception {
        Route routeB = createRoute(businessB.getId(), "Route B");

        // 1. GET Route B with Token A -> 404
        mockMvc.perform(get("/api/routes/" + routeB.getId())
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());

        // 2. PUT Route B with Token A -> 404
        RouteDtos.RouteRequest updateRequest = new RouteDtos.RouteRequest(
                "Hacked Route B", null, "Pune Depot", 18.5, 73.8, true);

        mockMvc.perform(put("/api/routes/" + routeB.getId())
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isNotFound());

        // 3. PATCH setActive Route B with Token A -> 404
        mockMvc.perform(patch("/api/routes/" + routeB.getId() + "/active")
                        .param("active", "false")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Route list endpoint for User A returns only Business A routes")
    void route_List_StrictlyScopedToTenant() throws Exception {
        Route routeA = createRoute(businessA.getId(), "Route A");
        createRoute(businessB.getId(), "Route B");

        mockMvc.perform(get("/api/routes")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id", is(routeA.getId().intValue())))
                .andExpect(jsonPath("$[0].name", is("Route A")));
    }
}
