package com.routeledger.repository;

import com.routeledger.domain.Role;
import com.routeledger.domain.User;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    Optional<User> findByVerificationToken(String verificationToken);

    Optional<User> findByIdAndBusinessId(Long id, Long businessId);

    List<User> findByBusinessIdOrderByNameAsc(Long businessId);

    List<User> findByBusinessIdAndRoleOrderByNameAsc(Long businessId, Role role);

    long countByBusinessId(Long businessId);
}
