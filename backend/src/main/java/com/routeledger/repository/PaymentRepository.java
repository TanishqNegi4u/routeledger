package com.routeledger.repository;

import com.routeledger.domain.Payment;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    Optional<Payment> findByIdAndBusinessId(Long id, Long businessId);

    List<Payment> findByCustomerIdOrderByPaidOnDescIdDesc(Long customerId);

    List<Payment> findByInvoiceIdOrderByPaidOnAsc(Long invoiceId);

    Page<Payment> findByBusinessIdOrderByPaidOnDescIdDesc(Long businessId, Pageable pageable);

    Page<Payment> findByBusinessIdAndCustomerIdOrderByPaidOnDescIdDesc(Long businessId,
                                                                      Long customerId,
                                                                      Pageable pageable);

    /** rows: [paidOn, totalPaise, paymentCount] for the collections chart. */
    @Query("""
            select p.paidOn, coalesce(sum(p.amountPaise), 0), count(p)
            from Payment p
            where p.businessId = :businessId
              and p.paidOn between :from and :to
            group by p.paidOn
            order by p.paidOn
            """)
    List<Object[]> collectedByDay(@Param("businessId") Long businessId,
                                 @Param("from") LocalDate from,
                                 @Param("to") LocalDate to);

    @Query("""
            select coalesce(sum(p.amountPaise), 0)
            from Payment p
            where p.businessId = :businessId
              and p.paidOn between :from and :to
            """)
    Long collectedBetween(@Param("businessId") Long businessId,
                          @Param("from") LocalDate from,
                          @Param("to") LocalDate to);

    @Query("""
            select count(p) > 0
            from Payment p
            where p.businessId = :businessId
              and p.customerId = :customerId
              and p.amountPaise = :amountPaise
              and p.createdAt >= :since
            """)
    boolean existsRecentDuplicate(@Param("businessId") Long businessId,
                                  @Param("customerId") Long customerId,
                                  @Param("amountPaise") long amountPaise,
                                  @Param("since") java.time.Instant since);
}
