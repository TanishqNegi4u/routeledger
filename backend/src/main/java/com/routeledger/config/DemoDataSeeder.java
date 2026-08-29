package com.routeledger.config;

import com.routeledger.domain.Business;
import com.routeledger.domain.Customer;
import com.routeledger.domain.DeliveryPause;
import com.routeledger.domain.DeliveryRun;
import com.routeledger.domain.DeliveryStop;
import com.routeledger.domain.Frequency;
import com.routeledger.domain.PaymentMode;
import com.routeledger.domain.Plan;
import com.routeledger.domain.Product;
import com.routeledger.domain.Role;
import com.routeledger.domain.Route;
import com.routeledger.domain.RunStatus;
import com.routeledger.domain.StopStatus;
import com.routeledger.domain.Subscription;
import com.routeledger.domain.User;
import com.routeledger.dto.InvoiceDtos;
import com.routeledger.dto.PaymentDtos;
import com.routeledger.dto.RunDtos;
import com.routeledger.repository.BusinessRepository;
import com.routeledger.repository.CustomerRepository;
import com.routeledger.repository.DeliveryPauseRepository;
import com.routeledger.repository.DeliveryRunRepository;
import com.routeledger.repository.DeliveryStopRepository;
import com.routeledger.repository.ProductRepository;
import com.routeledger.repository.RouteRepository;
import com.routeledger.repository.SubscriptionRepository;
import com.routeledger.repository.UserRepository;
import com.routeledger.service.InvoiceService;
import com.routeledger.service.PaymentService;
import com.routeledger.service.RunService;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Turns an empty database into a believable dairy round so the very first login lands on a dashboard
 * with real numbers instead of nine zeroes and four empty charts.
 *
 * <p>It is deliberately not a SQL dump. Master data is inserted directly, but the history is
 * <em>replayed through the real services</em> - {@link RunService#generate} sequences every morning
 * with the from-scratch route optimiser, {@link InvoiceService#generate} bills from actual delivered
 * lines, and {@link PaymentService#record} settles oldest-due-first. So the seeded tenant is
 * internally consistent by construction: the dues heap, the optimiser savings counter and both chart
 * series all derive from the same rows a live tenant would have produced.
 *
 * <p>Runs only when {@code routeledger.demo.seed} is true <em>and</em> the business table is empty,
 * so it is a no-op on every restart and on any real deployment that has already onboarded a tenant.
 */
@Component
@Order(50)
public class DemoDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);
    private static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");
    private static final long SEED = 42L;
    private static final int MAX_PLAN_CHUNK = 14;

    private final BusinessRepository businesses;
    private final UserRepository users;
    private final RouteRepository routes;
    private final ProductRepository products;
    private final CustomerRepository customers;
    private final SubscriptionRepository subscriptions;
    private final DeliveryPauseRepository pauses;
    private final DeliveryRunRepository runs;
    private final DeliveryStopRepository stops;
    private final PasswordEncoder encoder;
    private final RunService runService;
    private final InvoiceService invoiceService;
    private final PaymentService paymentService;

    private final boolean enabled;
    private final String ownerEmail;
    private final String rawPassword;
    private final String agentEmail;
    private final int historyDays;

    private final Random random = new Random(SEED);

    public DemoDataSeeder(BusinessRepository businesses,
                          UserRepository users,
                          RouteRepository routes,
                          ProductRepository products,
                          CustomerRepository customers,
                          SubscriptionRepository subscriptions,
                          DeliveryPauseRepository pauses,
                          DeliveryRunRepository runs,
                          DeliveryStopRepository stops,
                          PasswordEncoder encoder,
                          RunService runService,
                          InvoiceService invoiceService,
                          PaymentService paymentService,
                          @Value("${routeledger.demo.seed:true}") boolean enabled,
                          @Value("${routeledger.demo.email:owner@amrutdairy.in}") String ownerEmail,
                          @Value("${routeledger.demo.password:Demo@12345}") String rawPassword,
                          @Value("${routeledger.demo.agent-email:ravi@amrutdairy.in}") String agentEmail,
                          @Value("${routeledger.demo.history-days:45}") int historyDays) {
        this.businesses = businesses;
        this.users = users;
        this.routes = routes;
        this.products = products;
        this.customers = customers;
        this.subscriptions = subscriptions;
        this.pauses = pauses;
        this.runs = runs;
        this.stops = stops;
        this.encoder = encoder;
        this.runService = runService;
        this.invoiceService = invoiceService;
        this.paymentService = paymentService;
        this.enabled = enabled;
        this.ownerEmail = ownerEmail;
        this.rawPassword = rawPassword;
        this.agentEmail = agentEmail;
        this.historyDays = Math.max(7, Math.min(120, historyDays));
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) {
            log.info("Demo seed disabled (routeledger.demo.seed=false).");
            return;
        }
        if (businesses.count() > 0L) {
            log.info("Database already has a tenant - skipping demo seed.");
            return;
        }
        long startedAt = System.currentTimeMillis();
        try {
            seed();
            log.info("Demo tenant ready in {} ms. Sign in as {} / {}",
                    System.currentTimeMillis() - startedAt, ownerEmail, rawPassword);
        } catch (RuntimeException ex) {
            // A broken demo must never stop a real deployment from booting.
            log.warn("Demo seed aborted: {}", ex.getMessage(), ex);
        }
    }

    private void seed() {
        LocalDate today = LocalDate.now(ZONE);
        LocalDate from = today.minusDays(historyDays - 1L);

        Business business = business();
        Long bid = business.getId();
        List<User> staff = staff(bid);
        List<Product> catalogue = catalogue(bid);
        List<Route> beats = beats(bid, staff);
        List<Customer> book = customerBook(bid, beats, today);
        int orders = standingOrders(bid, book, catalogue, today);
        int windows = pauseWindows(bid, book, today);
        int plannedRuns = planHistory(bid, from, today);
        int closedStops = closeStops(bid, from, today);
        List<InvoiceDtos.InvoiceView> bills = billHistory(bid, from, today);
        int receipts = collectHistory(bid, bills, today);
        churn(book);

        log.info("Seeded '{}': {} staff, {} products, {} beats, {} customers, {} standing orders, "
                        + "{} pause windows, {} runs, {} completed stops, {} invoices, {} receipts "
                        + "across {} days.",
                business.getName(), staff.size(), catalogue.size(), beats.size(), book.size(), orders,
                windows, plannedRuns, closedStops, bills.size(), receipts, historyDays);
    }

    private Business business() {
        Business business = new Business();
        business.setName("Amrut Dairy & Daily Needs");
        business.setOwnerName("Suresh Kulkarni");
        business.setPhone("+919822011223");
        business.setCity("Pune");
        business.setPlan(Plan.GROWTH);
        business.setCurrency("INR");
        return businesses.save(business);
    }

    private List<User> staff(Long bid) {
        List<User> staff = new ArrayList<>();
        staff.add(user(bid, "Suresh Kulkarni", ownerEmail, "+919822011223", Role.OWNER));
        staff.add(user(bid, "Meera Deshpande", "meera@amrutdairy.in", "+919822011224", Role.MANAGER));
        staff.add(user(bid, "Ravi Pawar", agentEmail, "+919822011225", Role.AGENT));
        staff.add(user(bid, "Sanjay Jadhav", "sanjay@amrutdairy.in", "+919822011226", Role.AGENT));
        staff.add(user(bid, "Iqbal Shaikh", "iqbal@amrutdairy.in", "+919822011227", Role.AGENT));
        return users.saveAll(staff);
    }

    private User user(Long bid, String name, String email, String phone, Role role) {
        User user = new User();
        user.setBusinessId(bid);
        user.setName(name);
        user.setEmail(email.toLowerCase());
        user.setPhone(phone);
        user.setPasswordHash(encoder.encode(rawPassword));
        user.setRole(role);
        user.setActive(true);
        return user;
    }

    private List<Product> catalogue(Long bid) {
        List<Product> list = new ArrayList<>();
        list.add(product(bid, "Toned Milk Pouch", "500 ml", "Milk", 2800L));
        list.add(product(bid, "Full Cream Milk Pouch", "1 L", "Milk", 6600L));
        list.add(product(bid, "Desi Cow Milk (Loose)", "1 L", "Milk", 8500L));
        list.add(product(bid, "Fresh Curd Tub", "400 g", "Dairy", 4500L));
        list.add(product(bid, "Paneer Block", "200 g", "Dairy", 9000L));
        list.add(product(bid, "Masala Buttermilk", "500 ml", "Dairy", 2000L));
        list.add(product(bid, "Marathi Daily Newspaper", "1 copy", "Newspaper", 700L));
        list.add(product(bid, "Mineral Water Can", "20 L", "Water", 6000L));
        list.add(product(bid, "Brown Bread Loaf", "400 g", "Bakery", 4500L));
        return products.saveAll(list);
    }

    private Product product(Long bid, String name, String unit, String category, long paise) {
        Product product = new Product();
        product.setBusinessId(bid);
        product.setName(name);
        product.setUnitLabel(unit);
        product.setCategory(category);
        product.setPricePaise(paise);
        product.setActive(true);
        return product;
    }

    private List<Route> beats(Long bid, List<User> staff) {
        List<Long> agents = new ArrayList<>();
        for (User user : staff) {
            if (user.getRole() == Role.AGENT) {
                agents.add(user.getId());
            }
        }
        List<Route> list = new ArrayList<>();
        list.add(route(bid, "Kothrud Morning Beat", agents.get(0),
                "Amrut Depot, Kothrud Stand", 18.50740d, 73.80770d));
        list.add(route(bid, "Aundh - Baner Beat", agents.get(1),
                "Aundh Chilling Point", 18.55900d, 73.80780d));
        list.add(route(bid, "Viman Nagar Beat", agents.get(2),
                "Viman Nagar Handover Hub", 18.56790d, 73.91430d));
        return routes.saveAll(list);
    }

    private Route route(Long bid, String name, Long agentId, String depot, double lat, double lng) {
        Route route = new Route();
        route.setBusinessId(bid);
        route.setName(name);
        route.setAgentId(agentId);
        route.setDepotLabel(depot);
        route.setDepotLat(lat);
        route.setDepotLng(lng);
        route.setActive(true);
        return route;
    }

    private static final String[] FIRST_NAMES = {
            "Anita", "Rahul", "Priya", "Vikram", "Sneha", "Amol", "Kavita", "Nilesh",
            "Pooja", "Ganesh", "Shruti", "Mahesh", "Deepa", "Rohit", "Manisha", "Tushar",
            "Ashwini", "Prasad", "Vaishali", "Sachin", "Rupali", "Kiran", "Swapnil", "Neha",
            "Abhijit", "Madhuri", "Yogesh", "Trupti", "Nitin", "Smita", "Harshad", "Jyoti",
            "Sameer", "Aarti", "Vivek", "Pallavi", "Dattatray", "Rekha", "Omkar", "Sunita",
            "Bhushan", "Chaitali", "Girish", "Leena", "Mangesh", "Nandini", "Pramod", "Varsha"};

    private static final String[] LAST_NAMES = {
            "Kulkarni", "Joshi", "Patil", "Deshmukh", "Shinde", "Gaikwad", "Bhosale", "Chavan",
            "Kadam", "Sawant", "More", "Pawar", "Salunkhe", "Thorat", "Naik", "Ghadge"};

    private static final String[] SOCIETIES = {
            "Sai Residency", "Shantiniketan CHS", "Gokul Heights", "Riverdale Enclave",
            "Vasant Vihar", "Krishna Kunj", "Panchvati Apartments", "Sunrise Meadows",
            "Silver Oak Society", "Ganesh Krupa", "Tulip Greens", "Anand Park"};

    private static final String[] LANDMARKS = {
            "opposite the water tank", "next to the milk booth", "behind Ganesh temple",
            "near the school gate", "beside the medical store", "above Shree Kirana",
            "at the end of the lane", "facing the garden gate"};

    /** Small pockets around each depot so the Kruskal beat-splitter has real structure to find. */
    private static final double[][] POCKETS = {
            {0.0045d, -0.0038d}, {-0.0052d, 0.0031d}, {0.0028d, 0.0061d}, {-0.0034d, -0.0059d}};

    private List<Customer> customerBook(Long bid, List<Route> beats, LocalDate today) {
        List<Customer> book = new ArrayList<>();
        int index = 0;
        for (Route beat : beats) {
            for (int i = 0; i < 16; i++) {
                double[] pocket = POCKETS[i % POCKETS.length];
                double lat = beat.getDepotLat() + pocket[0] + jitter(0.0016d);
                double lng = beat.getDepotLng() + pocket[1] + jitter(0.0016d);
                String name = FIRST_NAMES[index % FIRST_NAMES.length] + " "
                        + LAST_NAMES[(index * 5 + 3) % LAST_NAMES.length];
                Customer customer = new Customer();
                customer.setBusinessId(bid);
                customer.setRouteId(beat.getId());
                customer.setName(name);
                customer.setPhone("+9198" + String.format("%08d", 22030000L + index));
                customer.setAddress("Flat " + (101 + (index % 9) * 3) + ", "
                        + SOCIETIES[index % SOCIETIES.length] + ", Lane " + (1 + index % 6));
                customer.setLandmark(LANDMARKS[index % LANDMARKS.length]);
                customer.setLat(round6(lat));
                customer.setLng(round6(lng));
                customer.setJoinedOn(today.minusDays(60L + random.nextInt(400)));
                customer.setActive(true);
                if (index % 7 == 0) {
                    customer.setNotes("Ring the bell twice - elderly couple.");
                }
                book.add(customer);
                index++;
            }
        }
        return customers.saveAll(book);
    }

    private double jitter(double spread) {
        return (random.nextDouble() - 0.5d) * 2.0d * spread;
    }

    private static double round6(double value) {
        return Math.round(value * 1_000_000.0d) / 1_000_000.0d;
    }

    /**
     * One milk line per household plus a few add-ons, spread across all three frequencies so the
     * schedule resolver and the weekday mask are both genuinely exercised.
     */
    private int standingOrders(Long bid, List<Customer> book, List<Product> catalogue,
                               LocalDate today) {
        List<Subscription> list = new ArrayList<>();
        LocalDate horizon = today.minusDays(historyDays + 10L);
        int index = 0;
        for (Customer customer : book) {
            LocalDate startOn = customer.getJoinedOn().isAfter(horizon)
                    ? customer.getJoinedOn() : horizon;
            Product milk = catalogue.get(index % 3);
            list.add(subscription(bid, customer, milk, 1 + random.nextInt(2), index, startOn));
            if (index % 3 == 0) {
                list.add(subscription(bid, customer, catalogue.get(3), 1, index + 1, startOn));
            }
            if (index % 5 == 0) {
                list.add(subscription(bid, customer, catalogue.get(6), 1, index + 2, startOn));
            }
            if (index % 8 == 0) {
                list.add(subscription(bid, customer, catalogue.get(7), 1, index + 4, startOn));
            }
            if (index % 11 == 0) {
                list.add(subscription(bid, customer, catalogue.get(4), 1, index + 6, startOn));
            }
            index++;
        }
        return subscriptions.saveAll(list).size();
    }

    private Subscription subscription(Long bid, Customer customer, Product product, int quantity,
                                      int salt, LocalDate startOn) {
        Subscription subscription = new Subscription();
        subscription.setBusinessId(bid);
        subscription.setCustomerId(customer.getId());
        subscription.setProductId(product.getId());
        subscription.setQuantity(Math.max(1, quantity));
        int bucket = salt % 10;
        if (bucket == 7 || bucket == 8) {
            subscription.setFrequency(Frequency.ALTERNATE_DAY);
            subscription.setWeekdayMask(127);
        } else if (bucket == 9) {
            subscription.setFrequency(Frequency.WEEKLY_DAYS);
            // Mon + Thu + Sun, bit 0 = Monday.
            subscription.setWeekdayMask(0b1001001);
        } else {
            subscription.setFrequency(Frequency.DAILY);
            subscription.setWeekdayMask(127);
        }
        subscription.setStartOn(startOn);
        subscription.setActive(true);
        return subscription;
    }

    private int pauseWindows(Long bid, List<Customer> book, LocalDate today) {
        List<DeliveryPause> list = new ArrayList<>();
        int[] offsets = {32, 26, 19, 14, 9, 5};
        String[] reasons = {"Village trip", "Out of town for a wedding", "Hospital admission",
                "Holidays at native place", "Family function", "Travelling for work"};
        for (int i = 0; i < offsets.length; i++) {
            Customer customer = book.get((i * 7 + 2) % book.size());
            LocalDate start = today.minusDays(offsets[i]);
            list.add(pause(bid, customer, start, start.plusDays(2L + (i % 3)), reasons[i]));
        }
        // Two live windows so "paused today" on the dashboard is never a lonely zero.
        list.add(pause(bid, book.get(4), today.minusDays(1L), today.plusDays(3L), "Kerala trip"));
        list.add(pause(bid, book.get(23), today, today.plusDays(6L), "House being repainted"));
        list.add(pause(bid, book.get(41), today.plusDays(9L), today.plusDays(15L), "Summer holidays"));
        return pauses.saveAll(list).size();
    }

    private DeliveryPause pause(Long bid, Customer customer, LocalDate from, LocalDate to,
                               String reason) {
        DeliveryPause pause = new DeliveryPause();
        pause.setBusinessId(bid);
        pause.setCustomerId(customer.getId());
        pause.setStartOn(from);
        pause.setEndOn(to);
        pause.setReason(reason);
        return pause;
    }

    /**
     * Replays every morning through the real optimiser in {@value #MAX_PLAN_CHUNK}-day batches, which
     * is exactly what the API allows a manager to request in one call.
     */
    private int planHistory(Long bid, LocalDate from, LocalDate to) {
        int created = 0;
        LocalDate cursor = from;
        while (!cursor.isAfter(to)) {
            LocalDate chunkEnd = cursor.plusDays(MAX_PLAN_CHUNK - 1L);
            if (chunkEnd.isAfter(to)) {
                chunkEnd = to;
            }
            int days = (int) (ChronoUnit.DAYS.between(cursor, chunkEnd) + 1L);
            RunDtos.GenerateRunResponse response = runService.generate(bid,
                    new RunDtos.GenerateRunRequest(cursor, days, null, "ROAD_APPROX", Boolean.FALSE));
            created += response.createdRuns();
            cursor = chunkEnd.plusDays(1L);
        }
        return created;
    }

    /**
     * Closes out the past rounds and leaves roughly half of today's beat still pending, so the agent
     * screen has something to do and the dashboard shows a round in flight.
     */
    private int closeStops(Long bid, LocalDate from, LocalDate to) {
        int closed = 0;
        for (DeliveryRun run : runs.findByBusinessIdAndRunDateBetweenOrderByRunDateAsc(bid, from, to)) {
            List<DeliveryStop> list = stops.findByRunIdOrderBySeqAsc(run.getId());
            if (list.isEmpty()) {
                continue;
            }
            boolean live = run.getRunDate().isEqual(to);
            int cutoff = live ? (int) Math.round(list.size() * 0.55d) : list.size();
            int done = 0;
            for (int i = 0; i < cutoff; i++) {
                DeliveryStop stop = list.get(i);
                int roll = random.nextInt(100);
                if (roll < 94) {
                    stop.setStatus(StopStatus.DELIVERED);
                } else if (roll < 97) {
                    stop.setStatus(StopStatus.ABSENT);
                    stop.setNote("Nobody at the door - left with the neighbour.");
                } else {
                    stop.setStatus(StopStatus.SKIPPED);
                    stop.setNote("Customer asked to skip today.");
                }
                stop.setDeliveredAt(run.getRunDate()
                        .atTime(LocalTime.of(6, 5).plusMinutes(i * 3L)).atZone(ZONE).toInstant());
                done++;
            }
            stops.saveAll(list);
            run.setCompletedStops(done);
            run.setStatus(live ? RunStatus.IN_PROGRESS : RunStatus.COMPLETED);
            runs.save(run);
            closed += done;
        }
        return closed;
    }

    /** Bills each calendar month in the window, stopping short of today's still-open round. */
    private List<InvoiceDtos.InvoiceView> billHistory(Long bid, LocalDate from, LocalDate to) {
        List<InvoiceDtos.InvoiceView> all = new ArrayList<>();
        LocalDate lastBillable = to.minusDays(1L);
        LocalDate cursor = from.withDayOfMonth(1);
        while (!cursor.isAfter(lastBillable)) {
            LocalDate monthEnd = cursor.withDayOfMonth(cursor.lengthOfMonth());
            LocalDate periodStart = cursor.isBefore(from) ? from : cursor;
            LocalDate periodEnd = monthEnd.isAfter(lastBillable) ? lastBillable : monthEnd;
            if (ChronoUnit.DAYS.between(periodStart, periodEnd) + 1L >= 7L) {
                InvoiceDtos.GenerateInvoiceResponse response = invoiceService.generate(bid,
                        new InvoiceDtos.GenerateInvoiceRequest(periodStart, periodEnd, null,
                                periodEnd.plusDays(7L)));
                all.addAll(response.invoices());
            }
            cursor = monthEnd.plusDays(1L);
        }
        return all;
    }

    /**
     * Settles most bills, part-pays some and leaves the rest open on purpose - that spread is what
     * gives the risk-ranked dues heap something meaningful to sort.
     */
    private int collectHistory(Long bid, List<InvoiceDtos.InvoiceView> bills, LocalDate today) {
        int receipts = 0;
        for (InvoiceDtos.InvoiceView bill : bills) {
            if (bill.totalPaise() <= 0L) {
                continue;
            }
            int roll = random.nextInt(100);
            long amount;
            if (roll < 58) {
                amount = bill.totalPaise();
            } else if (roll < 80) {
                amount = Math.max(1L, bill.totalPaise() * (40L + random.nextInt(45)) / 100L);
            } else {
                continue;
            }
            LocalDate earliest = bill.issuedOn() == null ? bill.periodEnd() : bill.issuedOn();
            long span = ChronoUnit.DAYS.between(earliest, today);
            LocalDate paidOn = span <= 1L
                    ? today : earliest.plusDays(1L + random.nextInt((int) span));
            PaymentMode mode = random.nextInt(100) < 62 ? PaymentMode.CASH : PaymentMode.UPI;
            String reference = mode == PaymentMode.UPI
                    ? "UPI/" + (100000 + random.nextInt(899999)) : null;
            paymentService.record(bid, new PaymentDtos.PaymentRequest(
                    bill.customerId(), bill.id(), amount, mode, paidOn, reference));
            receipts++;
        }
        return receipts;
    }

    /**
     * Two households that walked away mid-cycle. Their balance stays open, so the dues heap gets to
     * apply the "hard to reach" penalty that pushes an unreachable debtor up the chase list.
     */
    private void churn(List<Customer> book) {
        int[] indices = {11, 38};
        for (int index : indices) {
            Customer customer = book.get(index);
            customer.setActive(false);
            customer.setNotes("Stopped the round mid-cycle - balance still open.");
            customers.save(customer);
        }
    }
}
