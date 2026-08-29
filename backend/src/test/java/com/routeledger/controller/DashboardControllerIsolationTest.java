package com.routeledger.controller;

import com.routeledger.domain.Customer;
import com.routeledger.domain.Invoice;
import com.routeledger.domain.InvoiceStatus;
import com.routeledger.domain.Route;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DashboardControllerIsolationTest extends BaseMultiTenantControllerTest {

    @Test
    @DisplayName("Dashboard overview for User A contains metrics exclusively for Business A")
    void dashboard_Metrics_StrictlyScopedToTenant() throws Exception {
        Route routeA = createRoute(businessA.getId(), "Route A");
        Customer customerA = createCustomer(businessA.getId(), routeA.getId(), "Customer A", "+919876500001");

        Invoice invA = new Invoice();
        invA.setBusinessId(businessA.getId());
        invA.setCustomerId(customerA.getId());
        invA.setStatus(InvoiceStatus.UNPAID);
        invA.setPeriodStart(LocalDate.now().minusDays(10));
        invA.setPeriodEnd(LocalDate.now());
        invA.setIssuedOn(LocalDate.now());
        invA.setDueOn(LocalDate.now().plusDays(5));
        invA.setSubtotalPaise(12000L);
        invA.setAdjustmentPaise(0L);
        invA.setTotalPaise(12000L);
        invA.setPaidPaise(0L);
        invoiceRepository.save(invA);

        Route routeB = createRoute(businessB.getId(), "Route B");
        Customer customerB1 = createCustomer(businessB.getId(), routeB.getId(), "Customer B1", "+919876500002");
        createCustomer(businessB.getId(), routeB.getId(), "Customer B2", "+919876500003");

        Invoice invB = new Invoice();
        invB.setBusinessId(businessB.getId());
        invB.setCustomerId(customerB1.getId());
        invB.setStatus(InvoiceStatus.UNPAID);
        invB.setPeriodStart(LocalDate.now().minusDays(10));
        invB.setPeriodEnd(LocalDate.now());
        invB.setIssuedOn(LocalDate.now());
        invB.setDueOn(LocalDate.now().plusDays(5));
        invB.setSubtotalPaise(99000L);
        invB.setAdjustmentPaise(0L);
        invB.setTotalPaise(99000L);
        invB.setPaidPaise(0L);
        invoiceRepository.save(invB);

        // Fetch Dashboard for Business A
        mockMvc.perform(get("/api/dashboard")
                        .header("Authorization", "Bearer " + tokenA)
                        .param("from", LocalDate.now().minusDays(30).toString())
                        .param("to", LocalDate.now().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.activeCustomers", is(1))) // only customer A
                .andExpect(jsonPath("$.summary.activeRoutes", is(1)))    // only route A
                .andExpect(jsonPath("$.summary.outstandingPaise", is(12000))); // only invoice A
    }
}
