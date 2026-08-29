package com.routeledger;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.transaction.annotation.EnableTransactionManagement;

@SpringBootApplication
@EnableTransactionManagement
public class RouteLedgerApplication {

    public static void main(String[] args) {
        SpringApplication.run(RouteLedgerApplication.class, args);
    }
}
