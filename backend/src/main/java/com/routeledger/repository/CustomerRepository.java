package com.routeledger.repository;

import com.routeledger.domain.Customer;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CustomerRepository extends JpaRepository<Customer, Long> {

    Optional<Customer> findByIdAndBusinessId(Long id, Long businessId);

    boolean existsByBusinessIdAndPhone(Long businessId, String phone);

    List<Customer> findByBusinessIdAndActiveTrue(Long businessId);

    List<Customer> findByBusinessIdAndRouteIdAndActiveTrueOrderByNameAsc(Long businessId, Long routeId);

    List<Customer> findByBusinessIdAndRouteIdIsNullAndActiveTrueOrderByNameAsc(Long businessId);

    List<Customer> findByBusinessIdAndIdIn(Long businessId, List<Long> ids);

    long countByBusinessIdAndActiveTrue(Long businessId);

    long countByBusinessIdAndRouteIdAndActiveTrue(Long businessId, Long routeId);

    Page<Customer> findByBusinessIdOrderByNameAsc(Long businessId, Pageable pageable);

    Page<Customer> findByBusinessIdAndActiveTrueOrderByNameAsc(Long businessId, Pageable pageable);

    Page<Customer> findByBusinessIdAndRouteIdOrderByNameAsc(Long businessId, Long routeId, Pageable pageable);

    Page<Customer> findByBusinessIdAndRouteIdAndActiveTrueOrderByNameAsc(Long businessId, Long routeId,
                                                                        Pageable pageable);

    /** Used only when the in-memory trie has not been warmed for this tenant yet. */
    @Query("""
            select c from Customer c
            where c.businessId = :businessId
              and (lower(c.name) like lower(concat('%', :term, '%'))
                   or c.phone like concat('%', :term, '%')
                   or lower(c.address) like lower(concat('%', :term, '%')))
            order by c.name asc
            """)
    List<Customer> fallbackSearch(@Param("businessId") Long businessId, @Param("term") String term);
}
