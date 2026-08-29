package com.routeledger.repository;

import com.routeledger.domain.DeliveryStop;
import com.routeledger.domain.StopStatus;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DeliveryStopRepository extends JpaRepository<DeliveryStop, Long> {

    List<DeliveryStop> findByRunIdOrderBySeqAsc(Long runId);

    Optional<DeliveryStop> findByIdAndBusinessId(Long id, Long businessId);

    void deleteByRunId(Long runId);

    long countByRunIdAndStatus(Long runId, StopStatus status);

    long countByRunIdAndStatusNot(Long runId, StopStatus status);

    /** rows: [runId, totalAmountPaise, stopCount] for the run list view. */
    @Query("""
            select s.runId, coalesce(sum(s.amountPaise), 0), count(s)
            from DeliveryStop s
            where s.runId in :runIds
            group by s.runId
            """)
    List<Object[]> totalsByRun(@Param("runIds") List<Long> runIds);

    /** rows: [runId, totalAmountPaise, stopCount] restricted to one status. */
    @Query("""
            select s.runId, coalesce(sum(s.amountPaise), 0), count(s)
            from DeliveryStop s
            where s.runId in :runIds and s.status = :status
            group by s.runId
            """)
    List<Object[]> totalsByRunAndStatus(@Param("runIds") List<Long> runIds,
                                       @Param("status") StopStatus status);

    @Query("""
            select r.runDate, coalesce(sum(s.amountPaise), 0), count(s)
            from DeliveryStop s, DeliveryRun r
            where s.runId = r.id
              and s.businessId = :businessId
              and s.status = :status
              and r.runDate between :from and :to
            group by r.runDate
            order by r.runDate
            """)
    List<Object[]> revenueByDay(@Param("businessId") Long businessId,
                               @Param("status") StopStatus status,
                               @Param("from") LocalDate from,
                               @Param("to") LocalDate to);

    @Query("""
            select s.status, count(s)
            from DeliveryStop s, DeliveryRun r
            where s.runId = r.id
              and s.businessId = :businessId
              and r.runDate between :from and :to
            group by s.status
            """)
    List<Object[]> statusBreakdown(@Param("businessId") Long businessId,
                                  @Param("from") LocalDate from,
                                  @Param("to") LocalDate to);

    @Query("""
            select coalesce(sum(s.amountPaise), 0)
            from DeliveryStop s, DeliveryRun r
            where s.runId = r.id
              and s.customerId = :customerId
              and s.status = :status
              and r.runDate between :from and :to
            """)
    Long deliveredAmountForCustomer(@Param("customerId") Long customerId,
                                    @Param("status") StopStatus status,
                                    @Param("from") LocalDate from,
                                    @Param("to") LocalDate to);
}
