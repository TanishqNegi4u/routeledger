package com.routeledger.repository;

import com.routeledger.domain.Route;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RouteRepository extends JpaRepository<Route, Long> {

    List<Route> findByBusinessIdOrderByNameAsc(Long businessId);

    List<Route> findByBusinessIdAndActiveTrueOrderByNameAsc(Long businessId);

    List<Route> findByBusinessIdAndAgentIdAndActiveTrueOrderByNameAsc(Long businessId, Long agentId);

    Optional<Route> findByIdAndBusinessId(Long id, Long businessId);

    boolean existsByBusinessIdAndNameIgnoreCase(Long businessId, String name);

    long countByBusinessIdAndActiveTrue(Long businessId);
}
