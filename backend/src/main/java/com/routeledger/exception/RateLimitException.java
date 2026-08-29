package com.routeledger.exception;

import org.springframework.http.HttpStatus;

/** Thrown when a rate limit (per-IP or per-account) has been exceeded. */
public class RateLimitException extends ApiException {

    public RateLimitException(String message) {
        super(HttpStatus.TOO_MANY_REQUESTS, message);
    }
}
