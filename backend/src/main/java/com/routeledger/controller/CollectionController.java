package com.routeledger.controller;

import com.routeledger.dto.CollectionDtos;
import com.routeledger.security.AuthPrincipal;
import com.routeledger.service.CollectionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The dues queue. Debtors are ranked by a composite risk score - money at stake, amplified
 * super-linearly by how long it has been outstanding and by how fragmented the balance is - and the
 * top k are extracted with the hand-written binary max-heap, so the ordering costs O(n + k log n)
 * rather than a full sort of the ledger.
 */
@RestController
@RequestMapping("/api/collections")
@Tag(name = "Collections", description = "Who to chase first, and what to say")
public class CollectionController {

    private final CollectionService collections;

    public CollectionController(CollectionService collections) {
        this.collections = collections;
    }

    @GetMapping("/dues")
    @Operation(summary = "Risk-ranked outstanding balances with a suggested action per row")
    public CollectionDtos.DuesResponse dues(@AuthenticationPrincipal AuthPrincipal principal,
                                           @RequestParam(required = false) Integer limit) {
        return collections.dues(principal.businessId(), limit);
    }
}
