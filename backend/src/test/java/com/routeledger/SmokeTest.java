package com.routeledger;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.routeledger.domain.Business;
import com.routeledger.domain.Plan;
import com.routeledger.domain.Role;
import com.routeledger.domain.User;
import com.routeledger.dto.AuthDtos;
import com.routeledger.repository.BusinessRepository;
import com.routeledger.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end smoke test booting the complete Spring Boot stack against the real database.
 * Verifies system health, authentication, token rotation, and authenticated API access.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SmokeTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private BusinessRepository businessRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void setUpDemoUserIfMissing() {
        if (userRepository.findByEmailIgnoreCase("owner@amrutdairy.in").isEmpty()) {
            Business business = new Business();
            business.setName("Amrut Dairy");
            business.setOwnerName("Amrut Deshmukh");
            business.setCity("Pune");
            business.setPhone("+919876543210");
            business.setCurrency("INR");
            business.setPlan(Plan.GROWTH);
            business = businessRepository.save(business);

            User user = new User();
            user.setBusinessId(business.getId());
            user.setName("Amrut Deshmukh");
            user.setEmail("owner@amrutdairy.in");
            user.setPhone("+919876543210");
            user.setRole(Role.OWNER);
            user.setPasswordHash(passwordEncoder.encode("Demo@12345"));
            user.setActive(true);
            userRepository.save(user);
        }
    }

    @Test
    @DisplayName("Smoke: /actuator/health returns 200 UP")
    void healthCheck_ReturnsUp() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status", is("UP")));
    }

    @Test
    @DisplayName("Smoke: Full login -> customer list -> token rotation -> logout workflow")
    void fullStack_AuthAndWorkflow_Smoke() throws Exception {
        // 1. Login with seeded demo credentials
        AuthDtos.LoginRequest loginRequest = new AuthDtos.LoginRequest("owner@amrutdairy.in", "Demo@12345");

        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", notNullValue()))
                .andExpect(jsonPath("$.refreshToken", notNullValue()))
                .andExpect(jsonPath("$.user.email", is("owner@amrutdairy.in")))
                .andExpect(jsonPath("$.business.name", is("Amrut Dairy")))
                .andReturn();

        AuthDtos.AuthResponse authResponse = objectMapper.readValue(
                loginResult.getResponse().getContentAsString(), AuthDtos.AuthResponse.class);

        String token = authResponse.token();
        String refreshToken = authResponse.refreshToken();
        assertNotNull(token);
        assertNotNull(refreshToken);

        // 2. Call authenticated endpoint (/api/customers) with Bearer token
        mockMvc.perform(get("/api/customers")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", notNullValue()));

        // 3. Rotate tokens with /api/auth/refresh
        AuthDtos.RefreshRequest refreshRequest = new AuthDtos.RefreshRequest(refreshToken);
        MvcResult refreshResult = mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(refreshRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", notNullValue()))
                .andExpect(jsonPath("$.refreshToken", notNullValue()))
                .andReturn();

        AuthDtos.AuthResponse rotatedResponse = objectMapper.readValue(
                refreshResult.getResponse().getContentAsString(), AuthDtos.AuthResponse.class);

        // 4. Logout with /api/auth/logout
        AuthDtos.LogoutRequest logoutRequest = new AuthDtos.LogoutRequest(rotatedResponse.refreshToken());
        mockMvc.perform(post("/api/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(logoutRequest)))
                .andExpect(status().isNoContent());
    }
}
