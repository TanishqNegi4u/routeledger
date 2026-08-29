package com.routeledger.repository;

import com.routeledger.domain.Subscription;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {

    Optional<Subscription> findByIdAndBusinessId(Long id, Long businessId);

    List<Subscription> findByCustomerIdOrderByIdAsc(Long customerId);

    List<Subscription> findByBusinessIdAndActiveTrue(Long businessId);

    List<Subscription> findByBusinessIdAndCustomerIdInAndActiveTrue(Long businessId, List<Long> customerIds);

    long countByBusinessIdAndActiveTrue(Long businessId);

    long countByCustomerIdAndActiveTrue(Long customerId);

    long countByProductIdAndActiveTrue(Long productId);

    /** Active lines whose date window contains the run date, for the given customers. */
    @Query("""
            select s from Subscription s
            where s.businessId = :businessId
              and s.active = true
              and s.customerId in :customerIds
              and s.startOn <= :onDate
              and (s.endOn is null or s.endOn >= :onDate)
            """)
    List<Subscription> findDueOn(@Param("businessId") Long businessId,
                                 @Param("customerIds") List<Long> customerIds,
                                 @Param("onDate") LocalDate onDate);

    /**
     * Active lines whose window intersects [from, to]. Loaded once per planning window so the
     * per-day resolution can run entirely in memory against the pause interval tree.
     */
    @Query("""
            select s from Subscription s
            where s.businessId = :businessId
              and s.active = true
              and s.customerId in :customerIds
              and s.startOn <= :to
              and (s.endOn is null or s.endOn >= :from)
            """)
    List<Subscription> findActiveInWindow(@Param("businessId") Long businessId,
                                          @Param("customerIds") List<Long> customerIds,
                                          @Param("from") LocalDate from,
                                          @Param("to") LocalDate to);
}
