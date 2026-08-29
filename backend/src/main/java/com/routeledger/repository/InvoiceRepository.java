package com.routeledger.repository;

import com.routeledger.domain.Invoice;
import com.routeledger.domain.InvoiceStatus;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InvoiceRepository extends JpaRepository<Invoice, Long> {

    Optional<Invoice> findByIdAndBusinessId(Long id, Long businessId);

    Optional<Invoice> findByCustomerIdAndPeriodStartAndPeriodEnd(Long customerId,
                                                                LocalDate periodStart,
                                                                LocalDate periodEnd);

    List<Invoice> findByCustomerIdOrderByPeriodStartDesc(Long customerId);

    Page<Invoice> findByBusinessIdOrderByIssuedOnDescIdDesc(Long businessId, Pageable pageable);

    Page<Invoice> findByBusinessIdAndStatusOrderByIssuedOnDescIdDesc(Long businessId,
                                                                    InvoiceStatus status,
                                                                    Pageable pageable);

    Page<Invoice> findByBusinessIdAndCustomerIdOrderByIssuedOnDescIdDesc(Long businessId,
                                                                        Long customerId,
                                                                        Pageable pageable);

    List<Invoice> findByBusinessIdAndStatusIn(Long businessId, List<InvoiceStatus> statuses);

    long countByBusinessIdAndStatus(Long businessId, InvoiceStatus status);

    @Query("""
            select coalesce(sum(i.totalPaise - i.paidPaise), 0)
            from Invoice i
            where i.businessId = :businessId
              and i.status in :statuses
              and i.totalPaise > i.paidPaise
            """)
    Long outstandingTotal(@Param("businessId") Long businessId,
                          @Param("statuses") List<InvoiceStatus> statuses);

    /**
     * Feeds the collections risk max-heap. Rows of
     * [customerId, outstandingPaise, earliestDueOn, openInvoiceCount].
     */
    @Query("""
            select i.customerId, coalesce(sum(i.totalPaise - i.paidPaise), 0), min(i.dueOn), count(i)
            from Invoice i
            where i.businessId = :businessId
              and i.status in :statuses
              and i.totalPaise > i.paidPaise
            group by i.customerId
            """)
    List<Object[]> outstandingByCustomer(@Param("businessId") Long businessId,
                                        @Param("statuses") List<InvoiceStatus> statuses);

    @Query("""
            select coalesce(sum(i.totalPaise), 0)
            from Invoice i
            where i.businessId = :businessId
              and i.periodStart >= :from
              and i.periodEnd <= :to
            """)
    Long billedBetween(@Param("businessId") Long businessId,
                       @Param("from") LocalDate from,
                       @Param("to") LocalDate to);

    /** Dashboard: how many bills are past their due date and still owe money. */
    @Query("""
            select count(i)
            from Invoice i
            where i.businessId = :businessId
              and i.status in :statuses
              and i.totalPaise > i.paidPaise
              and i.dueOn < :asOf
            """)
    long countOverdue(@Param("businessId") Long businessId,
                      @Param("statuses") List<InvoiceStatus> statuses,
                      @Param("asOf") LocalDate asOf);
}
