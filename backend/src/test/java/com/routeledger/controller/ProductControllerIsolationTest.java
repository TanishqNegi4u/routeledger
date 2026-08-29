package com.routeledger.controller;

import com.routeledger.domain.Product;
import com.routeledger.dto.ProductDtos;
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

class ProductControllerIsolationTest extends BaseMultiTenantControllerTest {

    @Test
    @DisplayName("User A cannot read, update, or deactivate Product belonging to Business B")
    void product_CrossTenant_Blocked() throws Exception {
        Product productB = createProduct(businessB.getId(), "Cow Milk B", 6400L);

        // 1. GET Product B with Token A -> 404
        mockMvc.perform(get("/api/products/" + productB.getId())
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());

        // 2. PUT Product B with Token A -> 404
        ProductDtos.ProductRequest updateRequest = new ProductDtos.ProductRequest(
                "Hacked Milk B", "L", null, 10000L, true);

        mockMvc.perform(put("/api/products/" + productB.getId())
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isNotFound());

        // 3. PATCH setActive Product B with Token A -> 404
        mockMvc.perform(patch("/api/products/" + productB.getId() + "/active")
                        .param("active", "false")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Product list endpoint for User A returns only Business A products")
    void product_List_StrictlyScopedToTenant() throws Exception {
        Product productA = createProduct(businessA.getId(), "Cow Milk A", 6200L);
        createProduct(businessB.getId(), "Buffalo Milk B", 7400L);

        mockMvc.perform(get("/api/products")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].id", is(productA.getId().intValue())))
                .andExpect(jsonPath("$.content[0].name", is("Cow Milk A")));
    }
}
