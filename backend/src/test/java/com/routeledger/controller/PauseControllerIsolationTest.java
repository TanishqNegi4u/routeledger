package com.routeledger.controller;

import com.routeledger.domain.Customer;
import com.routeledger.domain.DeliveryPause;
import com.routeledger.domain.Route;
import com.routeledger.dto.PauseDtos;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.LocalDate;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PauseControllerIsolationTest extends BaseMultiTenantControllerTest {

    @Test
    @DisplayName("User A cannot create or delete DeliveryPause belonging to Business B")
    void pause_CrossTenant_Blocked() throws Exception {
        Route routeB = createRoute(businessB.getId(), "Route B");
        Customer customerB = createCustomer(businessB.getId(), routeB.getId(), "Customer B", "+919876500002");

        // 1. POST pause on customer of Business B using Token A -> 404
        PauseDtos.PauseRequest createRequest = new PauseDtos.PauseRequest(
                customerB.getId(), null, LocalDate.now(), LocalDate.now().plusDays(3), "Traveling");

        mockMvc.perform(post("/api/pauses")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isNotFound());

        // 2. DELETE pause of Business B using Token A -> 404
        DeliveryPause pauseB = new DeliveryPause();
        pauseB.setBusinessId(businessB.getId());
        pauseB.setCustomerId(customerB.getId());
        pauseB.setStartOn(LocalDate.now());
        pauseB.setEndOn(LocalDate.now().plusDays(2));
        pauseB.setReason("Out of town");
        pauseB = deliveryPauseRepository.save(pauseB);

        mockMvc.perform(delete("/api/pauses/" + pauseB.getId())
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Pause list endpoint for User A returns only Business A pauses")
    void pause_List_StrictlyScopedToTenant() throws Exception {
        Route routeA = createRoute(businessA.getId(), "Route A");
        Customer customerA = createCustomer(businessA.getId(), routeA.getId(), "Customer A", "+919876500001");

        DeliveryPause pauseA = new DeliveryPause();
        pauseA.setBusinessId(businessA.getId());
        pauseA.setCustomerId(customerA.getId());
        pauseA.setStartOn(LocalDate.now());
        pauseA.setEndOn(LocalDate.now().plusDays(2));
        pauseA.setReason("Vacation A");
        deliveryPauseRepository.save(pauseA);

        Route routeB = createRoute(businessB.getId(), "Route B");
        Customer customerB = createCustomer(businessB.getId(), routeB.getId(), "Customer B", "+919876500002");

        DeliveryPause pauseB = new DeliveryPause();
        pauseB.setBusinessId(businessB.getId());
        pauseB.setCustomerId(customerB.getId());
        pauseB.setStartOn(LocalDate.now());
        pauseB.setEndOn(LocalDate.now().plusDays(2));
        pauseB.setReason("Vacation B");
        deliveryPauseRepository.save(pauseB);

        // Fetch pauses for customer A using Token A
        mockMvc.perform(get("/api/pauses")
                        .param("customerId", customerA.getId().toString())
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id", is(pauseA.getId().intValue())))
                .andExpect(jsonPath("$[0].customerName", is("Customer A")));

        // Fetch pauses for customer B using Token A -> 404
        mockMvc.perform(get("/api/pauses")
                        .param("customerId", customerB.getId().toString())
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());
    }
}
