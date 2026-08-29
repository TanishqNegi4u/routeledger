package com.routeledger.controller;

import com.routeledger.domain.Customer;
import com.routeledger.domain.Invoice;
import com.routeledger.domain.InvoiceStatus;
import com.routeledger.domain.Route;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CollectionControllerIsolationTest extends BaseMultiTenantControllerTest {

    @Test
    @DisplayName("Collection dues for User A only returns overdue customers from Business A")
    void collectionQueue_StrictlyScopedToTenant() throws Exception {
        Route routeA = createRoute(businessA.getId(), "Route A");
        Customer customerA = createCustomer(businessA.getId(), routeA.getId(), "Overdue Customer A", "+919876500001");

        Invoice invA = new Invoice();
        invA.setBusinessId(businessA.getId());
        invA.setCustomerId(customerA.getId());
        invA.setStatus(InvoiceStatus.UNPAID);
        invA.setPeriodStart(LocalDate.now().minusDays(45));
        invA.setPeriodEnd(LocalDate.now().minusDays(15));
        invA.setIssuedOn(LocalDate.now().minusDays(15));
        invA.setDueOn(LocalDate.now().minusDays(5)); // overdue!
        invA.setSubtotalPaise(25000L);
        invA.setAdjustmentPaise(0L);
        invA.setTotalPaise(25000L);
        invA.setPaidPaise(0L);
        invoiceRepository.save(invA);

        Route routeB = createRoute(businessB.getId(), "Route B");
        Customer customerB = createCustomer(businessB.getId(), routeB.getId(), "Overdue Customer B", "+919876500002");

        Invoice invB = new Invoice();
        invB.setBusinessId(businessB.getId());
        invB.setCustomerId(customerB.getId());
        invB.setStatus(InvoiceStatus.UNPAID);
        invB.setPeriodStart(LocalDate.now().minusDays(45));
        invB.setPeriodEnd(LocalDate.now().minusDays(15));
        invB.setIssuedOn(LocalDate.now().minusDays(15));
        invB.setDueOn(LocalDate.now().minusDays(5)); // overdue!
        invB.setSubtotalPaise(90000L);
        invB.setAdjustmentPaise(0L);
        invB.setTotalPaise(90000L);
        invB.setPaidPaise(0L);
        invoiceRepository.save(invB);

        mockMvc.perform(get("/api/collections/dues")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows", hasSize(1)))
                .andExpect(jsonPath("$.rows[0].customerId", is(customerA.getId().intValue())))
                .andExpect(jsonPath("$.rows[0].customerName", is("Overdue Customer A")));
    }
}
