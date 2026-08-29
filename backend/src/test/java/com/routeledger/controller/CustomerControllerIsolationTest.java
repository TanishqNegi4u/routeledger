package com.routeledger.controller;

import com.routeledger.domain.Customer;
import com.routeledger.domain.Route;
import com.routeledger.dto.CustomerDtos;
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

class CustomerControllerIsolationTest extends BaseMultiTenantControllerTest {

    @Test
    @DisplayName("User A cannot access, update, or deactivate Customer belonging to Business B (returns 404)")
    void customer_CrossTenant_Blocked() throws Exception {
        Route routeB = createRoute(businessB.getId(), "Route B");
        Customer customerB = createCustomer(businessB.getId(), routeB.getId(), "Customer B", "+919876500002");

        // 1. GET Customer B using Token A -> 404
        mockMvc.perform(get("/api/customers/" + customerB.getId())
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());

        // 2. PUT Customer B using Token A -> 404
        CustomerDtos.CustomerRequest updateRequest = new CustomerDtos.CustomerRequest(
                routeB.getId(), "Hacked Customer B", "+919876500002", "New Address", "Landmark", 18.5, 73.8, null, true, LocalDate.now());

        mockMvc.perform(put("/api/customers/" + customerB.getId())
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isNotFound());

        // 3. PATCH setActive Customer B using Token A -> 404
        mockMvc.perform(patch("/api/customers/" + customerB.getId() + "/active")
                        .param("active", "false")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Customer list endpoint for User A returns only Business A customers")
    void customer_List_StrictlyScopedToTenant() throws Exception {
        Route routeA = createRoute(businessA.getId(), "Route A");
        Customer customerA = createCustomer(businessA.getId(), routeA.getId(), "Customer A", "+919876500001");

        Route routeB = createRoute(businessB.getId(), "Route B");
        createCustomer(businessB.getId(), routeB.getId(), "Customer B", "+919876500002");

        mockMvc.perform(get("/api/customers")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].id", is(customerA.getId().intValue())))
                .andExpect(jsonPath("$.content[0].name", is("Customer A")));
    }
}
