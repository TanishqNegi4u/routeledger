package com.routeledger.repository;

import com.routeledger.domain.DeliveryPause;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DeliveryPauseRepository extends JpaRepository<DeliveryPause, Long> {

    Optional<DeliveryPause> findByIdAndBusinessId(Long id, Long businessId);

    List<DeliveryPause> findByCustomerIdOrderByStartOnDesc(Long customerId);

    /** Every pause whose window intersects [from, to]; loaded into the interval tree. */
    @Query("""
            select p from DeliveryPause p
            where p.businessId = :businessId
              and p.startOn <= :to
              and p.endOn >= :from
            """)
    List<DeliveryPause> findOverlapping(@Param("businessId") Long businessId,
                                        @Param("from") LocalDate from,
                                        @Param("to") LocalDate to);

    @Query("""
            select count(p) from DeliveryPause p
            where p.businessId = :businessId and p.startOn <= :on and p.endOn >= :on
            """)
    long countActiveOn(@Param("businessId") Long businessId, @Param("on") LocalDate on);
}
