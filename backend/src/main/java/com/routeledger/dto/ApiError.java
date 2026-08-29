package com.routeledger.dto;

import java.time.Instant;
import java.util.List;
import org.slf4j.MDC;

/** Single error envelope returned by {@code GlobalExceptionHandler} for every failure. */
public record ApiError(Instant timestamp,
                       int status,
                       String error,
                       String message,
                       String path,
                       String requestId,
                       List<FieldIssue> fieldErrors) {

    public record FieldIssue(String field, String message) {
    }

    public static ApiError of(int status, String error, String message, String path) {
        return new ApiError(Instant.now(), status, error, message, path, MDC.get("requestId"), List.of());
    }

    public static ApiError of(int status, String error, String message, String path,
                              List<FieldIssue> fieldErrors) {
        return new ApiError(Instant.now(), status, error, message, path, MDC.get("requestId"), fieldErrors);
    }
}
