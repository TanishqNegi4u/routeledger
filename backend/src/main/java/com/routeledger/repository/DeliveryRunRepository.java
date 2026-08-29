package com.routeledger.repository;

import com.routeledger.domain.DeliveryRun;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeliveryRunRepository extends JpaRepository<DeliveryRun, Long> {

    Optional<DeliveryRun> findByIdAndBusinessId(Long id, Long businessId);

    Optional<DeliveryRun> findByRouteIdAndRunDate(Long routeId, LocalDate runDate);

    List<DeliveryRun> findByBusinessIdAndRunDateOrderByIdAsc(Long businessId, LocalDate runDate);

    List<DeliveryRun> findByBusinessIdAndRunDateBetweenOrderByRunDateAsc(Long businessId,
                                                                        LocalDate from,
                                                                        LocalDate to);

    Page<DeliveryRun> findByBusinessIdOrderByRunDateDescIdAsc(Long businessId, Pageable pageable);

    List<DeliveryRun> findByRouteIdInAndRunDate(List<Long> routeIds, LocalDate runDate);

    long countByBusinessIdAndRunDate(Long businessId, LocalDate runDate);
}
