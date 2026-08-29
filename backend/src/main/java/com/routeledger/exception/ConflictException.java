package com.routeledger.exception;

import org.springframework.http.HttpStatus;

/** Used when a uniqueness or state rule would be violated, e.g. a duplicate phone number. */
public class ConflictException extends ApiException {

    public ConflictException(String message) {
        super(HttpStatus.CONFLICT, message);
    }
}
