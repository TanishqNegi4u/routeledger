package com.routeledger.repository;

import com.routeledger.domain.Product;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepository extends JpaRepository<Product, Long> {

    Page<Product> findByBusinessIdOrderByNameAsc(Long businessId, Pageable pageable);

    List<Product> findByBusinessIdAndActiveTrueOrderByNameAsc(Long businessId);

    List<Product> findByBusinessIdOrderByNameAsc(Long businessId);

    /** Unordered whole-catalogue read used to price standing orders in bulk. */
    List<Product> findByBusinessId(Long businessId);

    List<Product> findByBusinessIdAndIdIn(Long businessId, List<Long> ids);

    Optional<Product> findByIdAndBusinessId(Long id, Long businessId);

    boolean existsByBusinessIdAndNameIgnoreCase(Long businessId, String name);

    long countByBusinessIdAndActiveTrue(Long businessId);
}
