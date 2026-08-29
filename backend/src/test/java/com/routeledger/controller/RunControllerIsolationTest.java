package com.routeledger.controller;

import com.routeledger.domain.Customer;
import com.routeledger.domain.DeliveryRun;
import com.routeledger.domain.DeliveryStop;
import com.routeledger.domain.Route;
import com.routeledger.domain.RunStatus;
import com.routeledger.domain.StopStatus;
import com.routeledger.dto.RunDtos;
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

class RunControllerIsolationTest extends BaseMultiTenantControllerTest {

    @Test
    @DisplayName("User A cannot read or modify DeliveryRun/Stop belonging to Business B")
    void run_CrossTenant_Blocked() throws Exception {
        Route routeB = createRoute(businessB.getId(), "Route B");
        Customer customerB = createCustomer(businessB.getId(), routeB.getId(), "Customer B", "+919876500002");

        DeliveryRun runB = new DeliveryRun();
        runB.setBusinessId(businessB.getId());
        runB.setRouteId(routeB.getId());
        runB.setRunDate(LocalDate.now());
        runB.setStatus(RunStatus.IN_PROGRESS);
        runB.setTotalStops(1);
        runB.setCompletedStops(0);
        runB = deliveryRunRepository.save(runB);

        DeliveryStop stopB = new DeliveryStop();
        stopB.setBusinessId(businessB.getId());
        stopB.setRunId(runB.getId());
        stopB.setCustomerId(customerB.getId());
        stopB.setSeq(1);
        stopB.setStatus(StopStatus.PENDING);
        stopB.setAmountPaise(5000L);
        stopB = deliveryStopRepository.save(stopB);

        // 1. GET Run B with Token A -> 404
        mockMvc.perform(get("/api/runs/" + runB.getId())
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isNotFound());

        // 2. PATCH Stop B with Token A -> 404
        RunDtos.StopUpdateRequest updateRequest = new RunDtos.StopUpdateRequest(
                StopStatus.DELIVERED, "Delivered on doorstep", null);

        mockMvc.perform(patch("/api/runs/stops/" + stopB.getId())
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Run list endpoint for User A returns only Business A runs")
    void run_List_StrictlyScopedToTenant() throws Exception {
        Route routeA = createRoute(businessA.getId(), "Route A");
        DeliveryRun runA = new DeliveryRun();
        runA.setBusinessId(businessA.getId());
        runA.setRouteId(routeA.getId());
        runA.setRunDate(LocalDate.now());
        runA.setStatus(RunStatus.PLANNED);
        runA.setTotalStops(5);
        runA.setCompletedStops(0);
        deliveryRunRepository.save(runA);

        Route routeB = createRoute(businessB.getId(), "Route B");
        DeliveryRun runB = new DeliveryRun();
        runB.setBusinessId(businessB.getId());
        runB.setRouteId(routeB.getId());
        runB.setRunDate(LocalDate.now());
        runB.setStatus(RunStatus.PLANNED);
        runB.setTotalStops(8);
        runB.setCompletedStops(0);
        deliveryRunRepository.save(runB);

        mockMvc.perform(get("/api/runs")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].id", is(runA.getId().intValue())));
    }
}
