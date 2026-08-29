package com.routeledger.controller;

import com.routeledger.domain.Customer;
import com.routeledger.domain.Invoice;
import com.routeledger.domain.InvoiceStatus;
import com.routeledger.domain.Route;
import com.routeledger.dto.InvoiceDtos;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.LocalDate;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class InvoiceControllerIsolationTest extends BaseMultiTenantControllerTest {

    @Test
    @DisplayName("User A cannot read, adjust, or cancel Invoice belonging to Business B")
    void invoice_CrossTenant_Blocked() throws Exception {
        Route routeB = createRoute(businessB.getId(), "Route B");
        Customer customerB = createCustomer(businessB.getId(), routeB.getId(), "Customer B", "+919876500002");

        Invoice invB = new Invoice();
        invB.setBusinessId(businessB.getId());
        invB.setCustomerId(customerB.getId());
        invB.setStatus(InvoiceStatus.UNPAID);
        invB.setPeriodStart(LocalDate.now().minusDays(30));
        invB.setPeriodEnd(LocalDate.now());
        invB.setIssuedOn(LocalDate.now());
        invB.setDueOn(LocalDate.now().plusDays(7));
        invB.setSubtotalPaise(50000L);
        invB.setAdjustmentPaise(0L);
        invB.setTotalPaise(50000L);
        invB.setPaidPaise(0L);
        invB = invoiceRepository.save(invB);

        // 1. GET Invoice B with Token A -> 404
        mockMvc.perform(get("/api/invoices/" + invB.getId())
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());

        // 2. Cancel/Void Invoice B with Token A -> 404
        mockMvc.perform(patch("/api/invoices/" + invB.getId() + "/cancel")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());

        // 3. Adjust Invoice B with Token A -> 404
        InvoiceDtos.AdjustRequest adjustRequest = new InvoiceDtos.AdjustRequest(-500L, "Spoilage credit");
        mockMvc.perform(patch("/api/invoices/" + invB.getId() + "/adjust")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(adjustRequest)))
                .andExpect(status().isNotFound());

        // 4. Payments for Invoice B with Token A -> 404
        mockMvc.perform(get("/api/invoices/" + invB.getId() + "/payments")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Invoice list endpoint for User A returns only Business A invoices")
    void invoice_List_StrictlyScopedToTenant() throws Exception {
        Route routeA = createRoute(businessA.getId(), "Route A");
        Customer customerA = createCustomer(businessA.getId(), routeA.getId(), "Customer A", "+919876500001");

        Invoice invA = new Invoice();
        invA.setBusinessId(businessA.getId());
        invA.setCustomerId(customerA.getId());
        invA.setStatus(InvoiceStatus.UNPAID);
        invA.setPeriodStart(LocalDate.now().minusDays(30));
        invA.setPeriodEnd(LocalDate.now());
        invA.setIssuedOn(LocalDate.now());
        invA.setDueOn(LocalDate.now().plusDays(7));
        invA.setSubtotalPaise(30000L);
        invA.setAdjustmentPaise(0L);
        invA.setTotalPaise(30000L);
        invA.setPaidPaise(0L);
        invoiceRepository.save(invA);

        Route routeB = createRoute(businessB.getId(), "Route B");
        Customer customerB = createCustomer(businessB.getId(), routeB.getId(), "Customer B", "+919876500002");

        Invoice invB = new Invoice();
        invB.setBusinessId(businessB.getId());
        invB.setCustomerId(customerB.getId());
        invB.setStatus(InvoiceStatus.UNPAID);
        invB.setPeriodStart(LocalDate.now().minusDays(30));
        invB.setPeriodEnd(LocalDate.now());
        invB.setIssuedOn(LocalDate.now());
        invB.setDueOn(LocalDate.now().plusDays(7));
        invB.setSubtotalPaise(40000L);
        invB.setAdjustmentPaise(0L);
        invB.setTotalPaise(40000L);
        invB.setPaidPaise(0L);
        invoiceRepository.save(invB);

        mockMvc.perform(get("/api/invoices")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].customerId", is(customerA.getId().intValue())));
    }
}
