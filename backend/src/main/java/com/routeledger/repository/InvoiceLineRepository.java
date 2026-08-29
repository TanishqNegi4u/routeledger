package com.routeledger.repository;

import com.routeledger.domain.InvoiceLine;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InvoiceLineRepository extends JpaRepository<InvoiceLine, Long> {

    List<InvoiceLine> findByInvoiceIdOrderByIdAsc(Long invoiceId);

    List<InvoiceLine> findByInvoiceIdIn(List<Long> invoiceIds);

    void deleteByInvoiceId(Long invoiceId);
}
