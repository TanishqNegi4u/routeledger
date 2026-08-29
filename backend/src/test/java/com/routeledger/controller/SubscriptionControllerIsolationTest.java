package com.routeledger.controller;

import com.routeledger.domain.Customer;
import com.routeledger.domain.Frequency;
import com.routeledger.domain.Product;
import com.routeledger.domain.Route;
import com.routeledger.domain.Subscription;
import com.routeledger.dto.SubscriptionDtos;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.LocalDate;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SubscriptionControllerIsolationTest extends BaseMultiTenantControllerTest {

    @Test
    @DisplayName("User A cannot read, update, or deactivate Subscription belonging to Business B")
    void subscription_CrossTenant_Blocked() throws Exception {
        Route routeB = createRoute(businessB.getId(), "Route B");
        Customer customerB = createCustomer(businessB.getId(), routeB.getId(), "Customer B", "+919876500002");
        Product productB = createProduct(businessB.getId(), "Milk B", 6000L);

        Subscription subB = new Subscription();
        subB.setBusinessId(businessB.getId());
        subB.setCustomerId(customerB.getId());
        subB.setProductId(productB.getId());
        subB.setQuantity(2);
        subB.setFrequency(Frequency.DAILY);
        subB.setWeekdayMask(127);
        subB.setStartOn(LocalDate.now());
        subB.setActive(true);
        subB = subscriptionRepository.save(subB);

        // 1. GET Subscription B with Token A -> 404
        mockMvc.perform(get("/api/subscriptions/" + subB.getId())
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());

        // 2. PUT Subscription B with Token A -> 404
        SubscriptionDtos.SubscriptionRequest updateRequest = new SubscriptionDtos.SubscriptionRequest(
                customerB.getId(), productB.getId(), 3, Frequency.DAILY, 127, LocalDate.now(), null, true);

        mockMvc.perform(put("/api/subscriptions/" + subB.getId())
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isNotFound());

        // 3. PATCH setActive Subscription B with Token A -> 404
        mockMvc.perform(patch("/api/subscriptions/" + subB.getId() + "/active")
                        .param("active", "false")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Subscription list endpoint for User A returns only Business A subscriptions")
    void subscription_List_StrictlyScopedToTenant() throws Exception {
        Route routeA = createRoute(businessA.getId(), "Route A");
        Customer customerA = createCustomer(businessA.getId(), routeA.getId(), "Customer A", "+919876500001");
        Product productA = createProduct(businessA.getId(), "Milk A", 6000L);

        Subscription subA = new Subscription();
        subA.setBusinessId(businessA.getId());
        subA.setCustomerId(customerA.getId());
        subA.setProductId(productA.getId());
        subA.setQuantity(1);
        subA.setFrequency(Frequency.DAILY);
        subA.setWeekdayMask(127);
        subA.setStartOn(LocalDate.now());
        subA.setActive(true);
        subscriptionRepository.save(subA);

        Route routeB = createRoute(businessB.getId(), "Route B");
        Customer customerB = createCustomer(businessB.getId(), routeB.getId(), "Customer B", "+919876500002");
        Product productB = createProduct(businessB.getId(), "Milk B", 6000L);

        Subscription subB = new Subscription();
        subB.setBusinessId(businessB.getId());
        subB.setCustomerId(customerB.getId());
        subB.setProductId(productB.getId());
        subB.setQuantity(2);
        subB.setFrequency(Frequency.DAILY);
        subB.setWeekdayMask(127);
        subB.setStartOn(LocalDate.now());
        subB.setActive(true);
        subscriptionRepository.save(subB);

        // Fetch subscriptions for customer A using Token A
        mockMvc.perform(get("/api/subscriptions")
                        .param("customerId", customerA.getId().toString())
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id", is(subA.getId().intValue())));

        // Fetch subscriptions for customer B using Token A -> 404 (customer B does not belong to business A)
        mockMvc.perform(get("/api/subscriptions")
                        .param("customerId", customerB.getId().toString())
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());
    }
}
