package com.routeledger.exception;

import org.springframework.http.HttpStatus;

/** Base class for every deliberately thrown, client-visible failure. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;

    public ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
