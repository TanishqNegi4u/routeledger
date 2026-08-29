package com.routeledger.controller;

import com.routeledger.domain.Customer;
import com.routeledger.domain.Payment;
import com.routeledger.domain.PaymentMode;
import com.routeledger.domain.Route;
import com.routeledger.dto.PaymentDtos;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.time.LocalDate;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PaymentControllerIsolationTest extends BaseMultiTenantControllerTest {

    @Test
    @DisplayName("User A cannot record payment for Customer belonging to Business B")
    void payment_RecordOnOtherTenantCustomer_Blocked() throws Exception {
        Route routeB = createRoute(businessB.getId(), "Route B");
        Customer customerB = createCustomer(businessB.getId(), routeB.getId(), "Customer B", "+919876500002");

        PaymentDtos.PaymentRequest request = new PaymentDtos.PaymentRequest(
                customerB.getId(), null, 5000L, PaymentMode.UPI, LocalDate.now(), "TXN123");

        mockMvc.perform(post("/api/payments")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Payment list endpoint for User A returns only Business A payments")
    void payment_List_StrictlyScopedToTenant() throws Exception {
        Route routeA = createRoute(businessA.getId(), "Route A");
        Customer customerA = createCustomer(businessA.getId(), routeA.getId(), "Customer A", "+919876500001");

        Payment paymentA = new Payment();
        paymentA.setBusinessId(businessA.getId());
        paymentA.setCustomerId(customerA.getId());
        paymentA.setAmountPaise(3000L);
        paymentA.setMode(PaymentMode.CASH);
        paymentA.setPaidOn(LocalDate.now());
        paymentRepository.save(paymentA);

        Route routeB = createRoute(businessB.getId(), "Route B");
        Customer customerB = createCustomer(businessB.getId(), routeB.getId(), "Customer B", "+919876500002");

        Payment paymentB = new Payment();
        paymentB.setBusinessId(businessB.getId());
        paymentB.setCustomerId(customerB.getId());
        paymentB.setAmountPaise(7000L);
        paymentB.setMode(PaymentMode.UPI);
        paymentB.setPaidOn(LocalDate.now());
        paymentRepository.save(paymentB);

        mockMvc.perform(get("/api/payments")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].id", is(paymentA.getId().intValue())));
    }
}
