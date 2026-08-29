package com.routeledger.service;

import com.routeledger.domain.Customer;
import com.routeledger.domain.DeliveryRun;
import com.routeledger.domain.DeliveryStop;
import com.routeledger.domain.DeliveryStopItem;
import com.routeledger.domain.Product;
import com.routeledger.domain.Route;
import com.routeledger.domain.RunStatus;
import com.routeledger.domain.StopStatus;
import com.routeledger.domain.User;
import com.routeledger.dsa.GeoPoint;
import com.routeledger.dsa.RouteOptimizer;
import com.routeledger.dto.PageResponse;
import com.routeledger.dto.RunDtos;
import com.routeledger.exception.BadRequestException;
import com.routeledger.exception.NotFoundException;
import com.routeledger.repository.CustomerRepository;
import com.routeledger.repository.DeliveryRunRepository;
import com.routeledger.repository.DeliveryStopItemRepository;
import com.routeledger.repository.DeliveryStopRepository;
import com.routeledger.repository.ProductRepository;
import com.routeledger.repository.RouteRepository;
import com.routeledger.repository.UserRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The morning. Everything else in RouteLedger exists to make this one call good.
 *
 * <p>Generation walks every date in the planning window, asks {@link ScheduleResolver.Window}
 * which lines are actually due (interval-tree pause lookups), then hands the day's addresses to
 * {@link RouteOptimizer} which sequences them into a closed tour from the depot. The run row
 * records the optimised distance next to the greedy and as-entered baselines, so the operator can
 * see - in metres - what the algorithm saved them.</p>
 */
@Service
public class RunService {

    private static final int MAX_DAYS = 14;
    private static final int MAX_STOPS_PER_RUN = 1200;

    private final DeliveryRunRepository runs;
    private final DeliveryStopRepository stops;
    private final DeliveryStopItemRepository stopItems;
    private final RouteRepository routes;
    private final CustomerRepository customers;
    private final ProductRepository products;
    private final UserRepository users;
    private final ScheduleResolver scheduleResolver;

    public RunService(DeliveryRunRepository runs,
                      DeliveryStopRepository stops,
                      DeliveryStopItemRepository stopItems,
                      RouteRepository routes,
                      CustomerRepository customers,
                      ProductRepository products,
                      UserRepository users,
                      ScheduleResolver scheduleResolver) {
        this.runs = runs;
        this.stops = stops;
        this.stopItems = stopItems;
        this.routes = routes;
        this.customers = customers;
        this.products = products;
        this.users = users;
        this.scheduleResolver = scheduleResolver;
    }

    // ---------------------------------------------------------------- generation

    @Transactional
    public RunDtos.GenerateRunResponse generate(Long businessId, RunDtos.GenerateRunRequest request) {
        LocalDate from = request.runDate();
        int days = request.days() == null ? 1 : request.days();
        if (days < 1 || days > MAX_DAYS) {
            throw new BadRequestException("Plan between 1 and " + MAX_DAYS + " days in one pass.");
        }
        LocalDate to = from.plusDays(days - 1L);
        boolean replace = Boolean.TRUE.equals(request.replaceExisting());
        RouteOptimizer.DistanceModel model = parseModel(request.distanceModel());

        List<Route> targets = resolveRoutes(businessId, request.routeIds());
        if (targets.isEmpty()) {
            throw new BadRequestException("No active route matched. Create a route first.");
        }

        // One catalogue read and one customer read for the whole window.
        Map<Long, Product> catalogue = new HashMap<>();
        for (Product product : products.findByBusinessIdOrderByNameAsc(businessId)) {
            catalogue.put(product.getId(), product);
        }
        Map<Long, List<Customer>> byRoute = new HashMap<>();
        List<Long> everyCustomerId = new ArrayList<>();
        for (Route route : targets) {
            List<Customer> members =
                    customers.findByBusinessIdAndRouteIdAndActiveTrueOrderByNameAsc(businessId, route.getId());
            byRoute.put(route.getId(), members);
            for (Customer customer : members) {
                everyCustomerId.add(customer.getId());
            }
        }
        if (everyCustomerId.isEmpty()) {
            throw new BadRequestException("These routes have no active customers yet.");
        }

        // Build the interval trees once, then query them per (customer, day).
        ScheduleResolver.Window window =
                scheduleResolver.window(businessId, everyCustomerId, from, to);

        List<String> messages = new ArrayList<>();
        List<RunDtos.RunView> produced = new ArrayList<>();
        int created = 0;
        int rebuilt = 0;
        int skipped = 0;
        int totalStops = 0;
        int savedMetres = 0;

        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            List<ScheduleResolver.DueLine> dueToday = window.dueOn(date);
            Map<Long, List<ScheduleResolver.DueLine>> dueByCustomer = new HashMap<>();
            for (ScheduleResolver.DueLine line : dueToday) {
                dueByCustomer.computeIfAbsent(line.customerId(), key -> new ArrayList<>()).add(line);
            }
            for (Route route : targets) {
                Optional<DeliveryRun> existing = runs.findByRouteIdAndRunDate(route.getId(), date);
                if (existing.isPresent() && !replace) {
                    skipped++;
                    messages.add(route.getName() + " on " + date
                            + ": already planned, left untouched.");
                    produced.add(toRunView(existing.get(), route, agentName(businessId, route)));
                    continue;
                }
                Outcome outcome = buildRun(businessId, route, date, byRoute.get(route.getId()),
                        dueByCustomer, catalogue, model, existing.orElse(null));
                if (outcome == null) {
                    messages.add(route.getName() + " on " + date + ": nothing due, no run created.");
                    continue;
                }
                if (existing.isPresent()) {
                    rebuilt++;
                } else {
                    created++;
                }
                totalStops += outcome.run().getTotalStops();
                savedMetres += Math.max(0, outcome.run().getBaselineMetres() - outcome.run().getPlannedMetres());
                produced.add(outcome.view());
            }
        }

        produced.sort(Comparator.comparing(RunDtos.RunView::runDate)
                .thenComparing(RunDtos.RunView::routeName, Comparator.nullsLast(String::compareTo)));
        return new RunDtos.GenerateRunResponse(from, to, created, rebuilt, skipped,
                totalStops, savedMetres, messages, produced);
    }

    private record Outcome(DeliveryRun run, RunDtos.RunView view) {
    }

    /**
     * Sequences one route for one date. Returns null when nothing is due, so no empty run rows
     * are ever written.
     */
    private Outcome buildRun(Long businessId,
                             Route route,
                             LocalDate date,
                             List<Customer> members,
                             Map<Long, List<ScheduleResolver.DueLine>> dueByCustomer,
                             Map<Long, Product> catalogue,
                             RouteOptimizer.DistanceModel model,
                             DeliveryRun existing) {
        List<Customer> due = new ArrayList<>();
        if (members != null) {
            for (Customer customer : members) {
                List<ScheduleResolver.DueLine> lines = dueByCustomer.get(customer.getId());
                if (lines != null && !lines.isEmpty()) {
                    due.add(customer);
                }
            }
        }
        if (due.isEmpty()) {
            return null;
        }
        if (due.size() > MAX_STOPS_PER_RUN) {
            throw new BadRequestException("Route " + route.getName() + " has " + due.size()
                    + " stops on " + date + ". Split it into smaller beats (max "
                    + MAX_STOPS_PER_RUN + ") before planning.");
        }

        List<RouteOptimizer.Stop> located = new ArrayList<>(due.size());
        List<Customer> unlocated = new ArrayList<>();
        Map<Long, Customer> byId = new HashMap<>();
        for (Customer customer : due) {
            byId.put(customer.getId(), customer);
            if (hasCoordinates(customer)) {
                located.add(new RouteOptimizer.Stop(customer.getId(),
                        new GeoPoint(customer.getLat(), customer.getLng())));
            } else {
                unlocated.add(customer);
            }
        }

        GeoPoint depot = new GeoPoint(route.getDepotLat(), route.getDepotLng());
        RouteOptimizer.Plan plan = RouteOptimizer.plan(depot, located, model);

        DeliveryRun run = existing == null ? new DeliveryRun() : existing;
        if (existing != null) {
            List<Long> oldStopIds = new ArrayList<>();
            for (DeliveryStop old : stops.findByRunIdOrderBySeqAsc(run.getId())) {
                oldStopIds.add(old.getId());
            }
            if (!oldStopIds.isEmpty()) {
                stopItems.deleteByStopIdIn(oldStopIds);
            }
            stops.deleteByRunId(run.getId());
            stops.flush();
        }
        run.setBusinessId(businessId);
        run.setRouteId(route.getId());
        run.setRunDate(date);
        run.setStatus(RunStatus.PLANNED);
        run.setCompletedStops(0);
        run.setTotalStops(due.size());
        run.setPlannedMetres(metres(plan.optimisedMetres()));
        run.setGreedyMetres(metres(plan.greedyMetres()));
        run.setBaselineMetres(metres(plan.asEnteredMetres()));
        run.setTwoOptSwaps(plan.twoOptSwaps());
        run.setDistanceModel(plan.model().name());
        run.setSequencedAt(Instant.now());
        DeliveryRun saved = runs.save(run);

        long plannedValue = 0L;
        int seq = 0;
        List<Long> ordered = plan.orderedStopIds();
        for (int index = 0; index < ordered.size(); index++) {
            Customer customer = byId.get(ordered.get(index));
            if (customer == null) {
                continue;
            }
            int legMetres = index < plan.legMetres().size() ? metres(plan.legMetres().get(index)) : 0;
            plannedValue += writeStop(businessId, saved.getId(), customer, ++seq, legMetres,
                    dueByCustomer.get(customer.getId()), catalogue);
        }
        for (Customer customer : unlocated) {
            plannedValue += writeStop(businessId, saved.getId(), customer, ++seq, 0,
                    dueByCustomer.get(customer.getId()), catalogue);
        }

        RunDtos.RunView view = toRunView(saved, route.getName(), agentName(businessId, route),
                plannedValue, 0L);
        return new Outcome(saved, view);
    }

    /** Writes one stop plus its priced items and returns the stop's value in paise. */
    private long writeStop(Long businessId,
                           Long runId,
                           Customer customer,
                           int seq,
                           int legMetres,
                           List<ScheduleResolver.DueLine> lines,
                           Map<Long, Product> catalogue) {
        DeliveryStop stop = new DeliveryStop();
        stop.setBusinessId(businessId);
        stop.setRunId(runId);
        stop.setCustomerId(customer.getId());
        stop.setSeq(seq);
        stop.setStatus(StopStatus.PENDING);
        stop.setLegMetres(legMetres);
        stop.setAmountPaise(0L);
        DeliveryStop savedStop = stops.save(stop);

        long total = 0L;
        List<DeliveryStopItem> batch = new ArrayList<>();
        if (lines != null) {
            // Collapse duplicate product lines so the doorstep sheet shows one row per product.
            Map<Long, Integer> quantities = new LinkedHashMap<>();
            for (ScheduleResolver.DueLine line : lines) {
                quantities.merge(line.productId(), Math.max(0, line.quantity()), Integer::sum);
            }
            for (Map.Entry<Long, Integer> entry : quantities.entrySet()) {
                Product product = catalogue.get(entry.getKey());
                if (product == null || entry.getValue() <= 0) {
                    continue;
                }
                long lineTotal = product.getPricePaise() * entry.getValue();
                DeliveryStopItem item = new DeliveryStopItem();
                item.setStopId(savedStop.getId());
                item.setProductId(product.getId());
                item.setProductName(product.getName());
                item.setQuantity(entry.getValue());
                item.setUnitPricePaise(product.getPricePaise());
                item.setLineTotalPaise(lineTotal);
                batch.add(item);
                total += lineTotal;
            }
        }
        if (!batch.isEmpty()) {
            stopItems.saveAll(batch);
        }
        savedStop.setAmountPaise(total);
        stops.save(savedStop);
        return total;
    }

    private static boolean hasCoordinates(Customer customer) {
        return Math.abs(customer.getLat()) > 0.000001 || Math.abs(customer.getLng()) > 0.000001;
    }

    private static int metres(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value) || value <= 0.0) {
            return 0;
        }
        return (int) Math.min(Integer.MAX_VALUE, Math.round(value));
    }

    private static RouteOptimizer.DistanceModel parseModel(String raw) {
        if (raw == null || raw.isBlank()) {
            return RouteOptimizer.DistanceModel.ROAD_APPROX;
        }
        try {
            return RouteOptimizer.DistanceModel.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException("distanceModel must be GEODESIC or ROAD_APPROX.");
        }
    }

    private List<Route> resolveRoutes(Long businessId, List<Long> requested) {
        if (requested == null || requested.isEmpty()) {
            return routes.findByBusinessIdAndActiveTrueOrderByNameAsc(businessId);
        }
        List<Route> resolved = new ArrayList<>();
        for (Long id : requested) {
            if (id == null) {
                continue;
            }
            Route route = routes.findByIdAndBusinessId(id, businessId)
                    .orElseThrow(() -> NotFoundException.of("Route", id));
            if (route.isActive()) {
                resolved.add(route);
            }
        }
        return resolved;
    }

    // ---------------------------------------------------------------- reads

    @Transactional(readOnly = true)
    public PageResponse<RunDtos.RunView> page(Long businessId, Pageable pageable) {
        Page<DeliveryRun> found = runs.findByBusinessIdOrderByRunDateDescIdAsc(businessId, pageable);
        List<RunDtos.RunView> views = hydrate(businessId, found.getContent());
        return PageResponse.of(views, found.getNumber(), found.getSize(), found.getTotalElements());
    }

    @Transactional(readOnly = true)
    public List<RunDtos.RunView> forDate(Long businessId, LocalDate date) {
        return hydrate(businessId, runs.findByBusinessIdAndRunDateOrderByIdAsc(businessId, date));
    }

    /** The agent's own sheet: only routes assigned to them. */
    @Transactional(readOnly = true)
    public List<RunDtos.RunView> forAgent(Long businessId, Long agentId, LocalDate date) {
        List<Route> mine =
                routes.findByBusinessIdAndAgentIdAndActiveTrueOrderByNameAsc(businessId, agentId);
        if (mine.isEmpty()) {
            return List.of();
        }
        List<Long> routeIds = new ArrayList<>(mine.size());
        for (Route route : mine) {
            routeIds.add(route.getId());
        }
        return hydrate(businessId, runs.findByRouteIdInAndRunDate(routeIds, date));
    }

    @Transactional(readOnly = true)
    public RunDtos.RunDetailView detail(Long businessId, Long runId) {
        DeliveryRun run = requireRun(businessId, runId);
        List<DeliveryStop> rows = stops.findByRunIdOrderBySeqAsc(runId);
        List<RunDtos.StopView> views = stopViews(businessId, rows);
        List<RunDtos.RunView> header = hydrate(businessId, List.of(run));
        return new RunDtos.RunDetailView(header.get(0), views);
    }

    // ---------------------------------------------------------------- doorstep update

    @Transactional
    public RunDtos.StopView updateStop(Long businessId, Long stopId, RunDtos.StopUpdateRequest request) {
        DeliveryStop stop = stops.findByIdAndBusinessId(stopId, businessId)
                .orElseThrow(() -> NotFoundException.of("Delivery stop", stopId));
        DeliveryRun run = requireRun(businessId, stop.getRunId());

        if (request.items() != null && !request.items().isEmpty()) {
            applyOverrides(businessId, stop, request.items());
        }
        long amount = 0L;
        for (DeliveryStopItem item : stopItems.findByStopIdOrderByIdAsc(stop.getId())) {
            amount += item.getLineTotalPaise();
        }
        StopStatus status = request.status();
        stop.setStatus(status);
        stop.setNote(request.note());
        stop.setAmountPaise(status == StopStatus.DELIVERED ? amount : 0L);
        stop.setDeliveredAt(status == StopStatus.DELIVERED ? Instant.now() : null);
        DeliveryStop saved = stops.save(stop);
        stops.flush();

        long touched = stops.countByRunIdAndStatusNot(run.getId(), StopStatus.PENDING);
        run.setCompletedStops((int) touched);
        if (touched == 0L) {
            run.setStatus(RunStatus.PLANNED);
        } else if (touched >= run.getTotalStops()) {
            run.setStatus(RunStatus.COMPLETED);
        } else {
            run.setStatus(RunStatus.IN_PROGRESS);
        }
        runs.save(run);

        return stopViews(businessId, List.of(saved)).get(0);
    }

    private void applyOverrides(Long businessId, DeliveryStop stop, List<RunDtos.ItemOverride> overrides) {
        List<DeliveryStopItem> current = stopItems.findByStopIdOrderByIdAsc(stop.getId());
        Map<Long, DeliveryStopItem> byProduct = new HashMap<>();
        for (DeliveryStopItem item : current) {
            byProduct.put(item.getProductId(), item);
        }
        List<DeliveryStopItem> upserts = new ArrayList<>();
        List<DeliveryStopItem> removals = new ArrayList<>();
        for (RunDtos.ItemOverride override : overrides) {
            if (override == null || override.productId() == null) {
                continue;
            }
            DeliveryStopItem item = byProduct.get(override.productId());
            if (override.quantity() <= 0) {
                if (item != null) {
                    removals.add(item);
                }
                continue;
            }
            if (item == null) {
                Product product = products.findByIdAndBusinessId(override.productId(), businessId)
                        .orElseThrow(() -> NotFoundException.of("Product", override.productId()));
                item = new DeliveryStopItem();
                item.setStopId(stop.getId());
                item.setProductId(product.getId());
                item.setProductName(product.getName());
                item.setUnitPricePaise(product.getPricePaise());
            }
            item.setQuantity(override.quantity());
            item.setLineTotalPaise(item.getUnitPricePaise() * override.quantity());
            upserts.add(item);
        }
        if (!removals.isEmpty()) {
            stopItems.deleteAll(removals);
        }
        if (!upserts.isEmpty()) {
            stopItems.saveAll(upserts);
        }
        stopItems.flush();
    }

    // ---------------------------------------------------------------- mapping

    private DeliveryRun requireRun(Long businessId, Long runId) {
        return runs.findByIdAndBusinessId(runId, businessId)
                .orElseThrow(() -> NotFoundException.of("Delivery run", runId));
    }

    private List<RunDtos.StopView> stopViews(Long businessId, List<DeliveryStop> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        List<Long> stopIds = new ArrayList<>(rows.size());
        List<Long> customerIds = new ArrayList<>(rows.size());
        for (DeliveryStop stop : rows) {
            stopIds.add(stop.getId());
            customerIds.add(stop.getCustomerId());
        }
        Map<Long, List<RunDtos.StopItemView>> items = new HashMap<>();
        for (DeliveryStopItem item : stopItems.findByStopIdIn(stopIds)) {
            items.computeIfAbsent(item.getStopId(), key -> new ArrayList<>())
                    .add(new RunDtos.StopItemView(item.getId(), item.getProductId(),
                            item.getProductName(), item.getQuantity(),
                            item.getUnitPricePaise(), item.getLineTotalPaise()));
        }
        Map<Long, Customer> people = new HashMap<>();
        for (Customer customer : customers.findByBusinessIdAndIdIn(businessId, customerIds)) {
            people.put(customer.getId(), customer);
        }
        List<RunDtos.StopView> views = new ArrayList<>(rows.size());
        for (DeliveryStop stop : rows) {
            Customer customer = people.get(stop.getCustomerId());
            views.add(new RunDtos.StopView(stop.getId(), stop.getSeq(), stop.getCustomerId(),
                    customer == null ? "Customer #" + stop.getCustomerId() : customer.getName(),
                    customer == null ? null : customer.getPhone(),
                    customer == null ? null : customer.getAddress(),
                    customer == null ? null : customer.getLandmark(),
                    customer == null ? 0.0 : customer.getLat(),
                    customer == null ? 0.0 : customer.getLng(),
                    stop.getStatus() == null ? StopStatus.PENDING.name() : stop.getStatus().name(),
                    stop.getAmountPaise(), stop.getLegMetres(), stop.getDeliveredAt(), stop.getNote(),
                    items.getOrDefault(stop.getId(), List.of())));
        }
        return views;
    }

    private List<RunDtos.RunView> hydrate(Long businessId, List<DeliveryRun> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<Long, Route> routeById = new HashMap<>();
        for (Route route : routes.findByBusinessIdOrderByNameAsc(businessId)) {
            routeById.put(route.getId(), route);
        }
        Map<Long, String> agentById = new HashMap<>();
        for (User user : users.findByBusinessIdOrderByNameAsc(businessId)) {
            agentById.put(user.getId(), user.getName());
        }
        List<Long> runIds = new ArrayList<>(rows.size());
        for (DeliveryRun run : rows) {
            runIds.add(run.getId());
        }
        Map<Long, Long> planned = new HashMap<>();
        for (Object[] row : stops.totalsByRun(runIds)) {
            planned.put(asLong(row[0]), asLong(row[1]));
        }
        Map<Long, Long> collected = new HashMap<>();
        for (Object[] row : stops.totalsByRunAndStatus(runIds, StopStatus.DELIVERED)) {
            collected.put(asLong(row[0]), asLong(row[1]));
        }
        List<RunDtos.RunView> views = new ArrayList<>(rows.size());
        for (DeliveryRun run : rows) {
            Route route = routeById.get(run.getRouteId());
            String agent = route == null || route.getAgentId() == null
                    ? null
                    : agentById.get(route.getAgentId());
            views.add(toRunView(run, route == null ? "Route #" + run.getRouteId() : route.getName(),
                    agent,
                    planned.getOrDefault(run.getId(), 0L),
                    collected.getOrDefault(run.getId(), 0L)));
        }
        return views;
    }

    private String agentName(Long businessId, Route route) {
        if (route == null || route.getAgentId() == null) {
            return null;
        }
        return users.findByIdAndBusinessId(route.getAgentId(), businessId)
                .map(User::getName)
                .orElse(null);
    }

    private RunDtos.RunView toRunView(DeliveryRun run, Route route, String agentName) {
        long planned = 0L;
        long collected = 0L;
        List<Long> ids = List.of(run.getId());
        for (Object[] row : stops.totalsByRun(ids)) {
            planned = asLong(row[1]);
        }
        for (Object[] row : stops.totalsByRunAndStatus(ids, StopStatus.DELIVERED)) {
            collected = asLong(row[1]);
        }
        return toRunView(run, route == null ? "Route #" + run.getRouteId() : route.getName(),
                agentName, planned, collected);
    }

    private static RunDtos.RunView toRunView(DeliveryRun run,
                                             String routeName,
                                             String agentName,
                                             long plannedValuePaise,
                                             long collectedValuePaise) {
        int saved = Math.max(0, run.getBaselineMetres() - run.getPlannedMetres());
        double savedPercent = run.getBaselineMetres() <= 0
                ? 0.0
                : Math.round(saved * 10000.0 / run.getBaselineMetres()) / 100.0;
        return new RunDtos.RunView(run.getId(), run.getRouteId(), routeName, agentName,
                run.getRunDate(),
                run.getStatus() == null ? RunStatus.PLANNED.name() : run.getStatus().name(),
                run.getTotalStops(), run.getCompletedStops(), run.getPlannedMetres(),
                run.getGreedyMetres(), run.getBaselineMetres(), saved, savedPercent,
                run.getTwoOptSwaps(), run.getDistanceModel(), plannedValuePaise, collectedValuePaise,
                run.getSequencedAt());
    }

    static long asLong(Object value) {
        if (value == null) {
            return 0L;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.parseLong(value.toString());
    }
}
