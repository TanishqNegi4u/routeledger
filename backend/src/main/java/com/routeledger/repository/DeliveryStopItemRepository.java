package com.routeledger.repository;

import com.routeledger.domain.DeliveryStopItem;
import com.routeledger.domain.StopStatus;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DeliveryStopItemRepository extends JpaRepository<DeliveryStopItem, Long> {

    List<DeliveryStopItem> findByStopIdOrderByIdAsc(Long stopId);

    List<DeliveryStopItem> findByStopIdIn(List<Long> stopIds);

    void deleteByStopIdIn(List<Long> stopIds);

    /** Dashboard: best sellers by value for a period. */
    @Query("""
            select i.productName, sum(i.quantity), coalesce(sum(i.lineTotalPaise), 0)
            from DeliveryStopItem i, DeliveryStop s, DeliveryRun r
            where i.stopId = s.id
              and s.runId = r.id
              and s.businessId = :businessId
              and s.status = :status
              and r.runDate between :from and :to
            group by i.productName
            order by sum(i.lineTotalPaise) desc
            """)
    List<Object[]> topProducts(@Param("businessId") Long businessId,
                               @Param("status") StopStatus status,
                               @Param("from") LocalDate from,
                               @Param("to") LocalDate to);

    /**
     * Invoice generation: everything actually delivered to one customer in a billing window,
     * rolled up per product and unit price. Returns rows of
     * [productName, unitPricePaise, totalQuantity, totalAmountPaise].
     */
    @Query("""
            select i.productName, i.unitPricePaise, sum(i.quantity), coalesce(sum(i.lineTotalPaise), 0)
            from DeliveryStopItem i, DeliveryStop s, DeliveryRun r
            where i.stopId = s.id
              and s.runId = r.id
              and s.customerId = :customerId
              and s.status = :status
              and r.runDate between :from and :to
            group by i.productName, i.unitPricePaise
            order by i.productName
            """)
    List<Object[]> billableLines(@Param("customerId") Long customerId,
                                 @Param("status") StopStatus status,
                                 @Param("from") LocalDate from,
                                 @Param("to") LocalDate to);
}
