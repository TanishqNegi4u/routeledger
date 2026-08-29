package com.routeledger.service;

import com.routeledger.domain.DeliveryPause;
import com.routeledger.domain.Frequency;
import com.routeledger.domain.Subscription;
import com.routeledger.dsa.IntervalTree;
import com.routeledger.repository.DeliveryPauseRepository;
import com.routeledger.repository.SubscriptionRepository;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns standing orders into the concrete list of lines that must actually be delivered on a
 * given day.
 *
 * <p>The hard part is skips. A customer can pause the whole household ("we're travelling
 * 12th-20th") or one line ("no curd this week"), windows can be added at any time and they can
 * be nested. Scanning every pause row for every customer on every day is O(days x pauses).
 * Instead each planning window loads its pauses once into an augmented AVL
 * {@link IntervalTree} keyed on epoch day, and every lookup becomes O(log n).
 */
@Service
public class ScheduleResolver {

    private final SubscriptionRepository subscriptions;
    private final DeliveryPauseRepository pauses;

    public ScheduleResolver(SubscriptionRepository subscriptions, DeliveryPauseRepository pauses) {
        this.subscriptions = subscriptions;
        this.pauses = pauses;
    }

    /** One resolved delivery line. */
    public record DueLine(Long customerId, Long subscriptionId, Long productId, int quantity) {
    }

    /**
     * An immutable snapshot of one planning window: the active subscriptions plus the pause
     * interval trees. Build it once, then ask it about each day.
     */
    public static final class Window {

        private final List<Subscription> lines;
        private final Map<Long, IntervalTree> customerPauses;
        private final Map<Long, IntervalTree> linePauses;

        private Window(List<Subscription> lines,
                       Map<Long, IntervalTree> customerPauses,
                       Map<Long, IntervalTree> linePauses) {
            this.lines = lines;
            this.customerPauses = customerPauses;
            this.linePauses = linePauses;
        }

        public List<Subscription> lines() {
            return lines;
        }

        /** True when the subscription is inside a household-wide or line-specific pause. */
        public boolean paused(Subscription line, LocalDate date) {
            long day = date.toEpochDay();
            IntervalTree household = customerPauses.get(line.getCustomerId());
            if (household != null && household.covers(day)) {
                return true;
            }
            IntervalTree single = linePauses.get(line.getId());
            return single != null && single.covers(day);
        }

        /** Distinct customers with at least one household-wide pause covering the date. */
        public int pausedHouseholds(LocalDate date) {
            long day = date.toEpochDay();
            int count = 0;
            for (IntervalTree tree : customerPauses.values()) {
                if (tree.covers(day)) {
                    count++;
                }
            }
            return count;
        }

        public List<DueLine> dueOn(LocalDate date) {
            List<DueLine> due = new ArrayList<>();
            for (Subscription line : lines) {
                if (!isScheduled(line, date) || paused(line, date)) {
                    continue;
                }
                due.add(new DueLine(line.getCustomerId(), line.getId(), line.getProductId(),
                        line.getQuantity()));
            }
            return due;
        }

        public Set<Long> customersDueOn(LocalDate date) {
            Set<Long> ids = new HashSet<>();
            for (DueLine line : dueOn(date)) {
                ids.add(line.customerId());
            }
            return ids;
        }
    }

    /**
     * Whether the calendar rule of a line fires on a date, ignoring pauses.
     * ALTERNATE_DAY counts from the line's own start date so two neighbours can be on
     * opposite days.
     */
    public static boolean isScheduled(Subscription line, LocalDate date) {
        if (line.getStartOn() != null && date.isBefore(line.getStartOn())) {
            return false;
        }
        if (line.getEndOn() != null && date.isAfter(line.getEndOn())) {
            return false;
        }
        Frequency frequency = line.getFrequency() == null ? Frequency.DAILY : line.getFrequency();
        return switch (frequency) {
            case DAILY -> true;
            case ALTERNATE_DAY -> {
                long anchor = line.getStartOn() == null ? 0L : line.getStartOn().toEpochDay();
                yield Math.floorMod(date.toEpochDay() - anchor, 2L) == 0L;
            }
            case WEEKLY_DAYS -> (line.getWeekdayMask() & (1 << (date.getDayOfWeek().getValue() - 1))) != 0;
        };
    }

    @Transactional(readOnly = true)
    public Window window(Long businessId, List<Long> customerIds, LocalDate from, LocalDate to) {
        if (customerIds == null || customerIds.isEmpty()) {
            return new Window(List.of(), Map.of(), Map.of());
        }
        List<Subscription> lines = subscriptions.findActiveInWindow(businessId, customerIds, from, to);
        Set<Long> wanted = new HashSet<>(customerIds);
        Map<Long, IntervalTree> byCustomer = new HashMap<>();
        Map<Long, IntervalTree> byLine = new HashMap<>();
        for (DeliveryPause pause : pauses.findOverlapping(businessId, from, to)) {
            if (!wanted.contains(pause.getCustomerId())) {
                continue;
            }
            long start = pause.getStartOn().toEpochDay();
            long end = pause.getEndOn().toEpochDay();
            long id = pause.getId() == null ? 0L : pause.getId();
            if (pause.getSubscriptionId() == null) {
                byCustomer.computeIfAbsent(pause.getCustomerId(), key -> new IntervalTree())
                        .insert(start, end, id);
            } else {
                byLine.computeIfAbsent(pause.getSubscriptionId(), key -> new IntervalTree())
                        .insert(start, end, id);
            }
        }
        return new Window(lines, byCustomer, byLine);
    }
}
