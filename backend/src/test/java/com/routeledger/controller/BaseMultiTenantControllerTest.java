package com.routeledger.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.routeledger.domain.Business;
import com.routeledger.domain.Customer;
import com.routeledger.domain.Plan;
import com.routeledger.domain.Product;
import com.routeledger.domain.Role;
import com.routeledger.domain.Route;
import com.routeledger.domain.User;
import com.routeledger.repository.BusinessRepository;
import com.routeledger.repository.CustomerRepository;
import com.routeledger.repository.DeliveryPauseRepository;
import com.routeledger.repository.DeliveryRunRepository;
import com.routeledger.repository.DeliveryStopItemRepository;
import com.routeledger.repository.DeliveryStopRepository;
import com.routeledger.repository.InvoiceLineRepository;
import com.routeledger.repository.InvoiceRepository;
import com.routeledger.repository.PaymentRepository;
import com.routeledger.repository.ProductRepository;
import com.routeledger.repository.RefreshTokenRepository;
import com.routeledger.repository.RouteRepository;
import com.routeledger.repository.SubscriptionRepository;
import com.routeledger.repository.UserRepository;
import com.routeledger.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
public abstract class BaseMultiTenantControllerTest {

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    @Autowired
    protected JwtService jwtService;

    @Autowired
    protected BusinessRepository businessRepository;

    @Autowired
    protected UserRepository userRepository;

    @Autowired
    protected RouteRepository routeRepository;

    @Autowired
    protected CustomerRepository customerRepository;

    @Autowired
    protected ProductRepository productRepository;

    @Autowired
    protected SubscriptionRepository subscriptionRepository;

    @Autowired
    protected DeliveryPauseRepository deliveryPauseRepository;

    @Autowired
    protected DeliveryRunRepository deliveryRunRepository;

    @Autowired
    protected DeliveryStopRepository deliveryStopRepository;

    @Autowired
    protected DeliveryStopItemRepository deliveryStopItemRepository;

    @Autowired
    protected InvoiceRepository invoiceRepository;

    @Autowired
    protected InvoiceLineRepository invoiceLineRepository;

    @Autowired
    protected PaymentRepository paymentRepository;

    @Autowired
    protected RefreshTokenRepository refreshTokenRepository;

    protected Business businessA;
    protected User userA;
    protected String tokenA;

    protected Business businessB;
    protected User userB;
    protected String tokenB;

    @BeforeEach
    void setUpTenants() {
        businessA = createBusiness("Amrut Dairy A", "Owner A", "+919876543210");
        userA = createUser(businessA.getId(), "Owner A", "owner.a." + System.nanoTime() + "@example.com", Role.OWNER);
        tokenA = jwtService.issue(userA);

        businessB = createBusiness("Heritage Dairy B", "Owner B", "+919876543211");
        userB = createUser(businessB.getId(), "Owner B", "owner.b." + System.nanoTime() + "@example.com", Role.OWNER);
        tokenB = jwtService.issue(userB);
    }

    protected Business createBusiness(String name, String ownerName, String phone) {
        Business b = new Business();
        b.setName(name);
        b.setOwnerName(ownerName);
        b.setPhone(phone);
        b.setCity("Pune");
        b.setPlan(Plan.GROWTH);
        b.setCurrency("INR");
        return businessRepository.save(b);
    }

    protected User createUser(Long businessId, String name, String email, Role role) {
        User u = new User();
        u.setBusinessId(businessId);
        u.setName(name);
        u.setEmail(email);
        u.setPhone("+919876543210");
        u.setPasswordHash("$2a$10$dummyhashedpasswordforsecuritytesting");
        u.setRole(role);
        u.setActive(true);
        u.setEmailVerified(true);
        return userRepository.save(u);
    }

    protected Route createRoute(Long businessId, String name) {
        Route r = new Route();
        r.setBusinessId(businessId);
        r.setName(name);
        r.setDepotLat(18.5204);
        r.setDepotLng(73.8567);
        r.setDepotLabel("Pune Central Hub");
        return routeRepository.save(r);
    }

    protected Customer createCustomer(Long businessId, Long routeId, String name, String phone) {
        Customer c = new Customer();
        c.setBusinessId(businessId);
        c.setRouteId(routeId);
        c.setName(name);
        c.setPhone(phone);
        c.setAddress("Flat 101, Galaxy Heights");
        c.setLat(18.5210);
        c.setLng(73.8570);
        c.setActive(true);
        return customerRepository.save(c);
    }

    protected Product createProduct(Long businessId, String name, long pricePaise) {
        Product p = new Product();
        p.setBusinessId(businessId);
        p.setName(name);
        p.setUnitLabel("L");
        p.setCategory("Dairy");
        p.setPricePaise(pricePaise);
        p.setActive(true);
        return productRepository.save(p);
    }
}
