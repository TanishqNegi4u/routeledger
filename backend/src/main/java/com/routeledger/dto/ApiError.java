package com.routeledger.dto;

import java.time.Instant;
import java.util.List;

/** Single error envelope returned by {@code GlobalExceptionHandler} for every failure. */
public record ApiError(Instant timestamp,
                       int status,
                       String error,
                       String message,
                       String path,
                       List<FieldIssue> fieldErrors) {

    public record FieldIssue(String field, String message) {
    }

    public static ApiError of(int status, String error, String message, String path) {
        return new ApiError(Instant.now(), status, error, message, path, List.of());
    }

    public static ApiError of(int status, String error, String message, String path,
                              List<FieldIssue> fieldErrors) {
        return new ApiError(Instant.now(), status, error, message, path, fieldErrors);
    }
}
