package com.routeledger.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI routeLedgerOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("RouteLedger API")
                        .version("1.0.0")
                        .description("""
                                Operations backbone for subscription delivery businesses: milk, water cans,
                                tiffin, newspapers and laundry rounds.

                                Every endpoint except registration, login and the health probe requires
                                `Authorization: Bearer <token>`. The tenant is taken from the token, never
                                from the request body, so one business can never read another's data.

                                Route sequencing, pause resolution, instant customer search, beat clustering
                                and the collections queue are powered by data structures implemented from
                                scratch in `com.routeledger.dsa`.
                                """)
                        .contact(new Contact().name("RouteLedger").email("support@routeledger.app"))
                        .license(new License().name("Proprietary")))
                .servers(List.of(
                        new Server().url("/").description("Same origin (through the nginx proxy)"),
                        new Server().url("http://localhost:8080").description("Local backend")))
                .addSecurityItem(new SecurityRequirement().addList("bearerAuth"))
                .components(new Components().addSecuritySchemes("bearerAuth",
                        new SecurityScheme()
                                .name("bearerAuth")
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")));
    }
}
