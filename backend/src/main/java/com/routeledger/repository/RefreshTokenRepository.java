package com.routeledger.repository;

import com.routeledger.domain.RefreshToken;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Access to persisted refresh token digests. All lookups use the SHA-256 hash.
 */
@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    List<RefreshToken> findByFamilyId(String familyId);

    @Modifying
    @Query("UPDATE RefreshToken r SET r.revoked = true, r.revocationReason = :reason WHERE r.familyId = :familyId AND r.revoked = false")
    int revokeFamily(@Param("familyId") String familyId, @Param("reason") String reason);

    @Modifying
    @Query("UPDATE RefreshToken r SET r.revoked = true, r.revocationReason = :reason WHERE r.userId = :userId AND r.revoked = false")
    int revokeAllForUser(@Param("userId") Long userId, @Param("reason") String reason);
}
