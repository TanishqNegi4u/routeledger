package com.routeledger.domain;

/**
 * Approval status lifecycle for customer subscription requests.
 * 
 * PENDING_PAYMENT: Customer started subscription but has not paid advance.
 * PENDING_APPROVAL: Customer paid advance; awaiting Owner review and approval.
 * APPROVED: Owner approved; service is active and dispatched to Manager & Agent morning runs.
 * REJECTED: Owner rejected; refund/credit returned to customer.
 */
public enum ApprovalStatus {
    PENDING_PAYMENT,
    PENDING_APPROVAL,
    APPROVED,
    REJECTED
}
