-- RouteLedger core schema. Money is stored in paise (integer) so no float ever
-- touches a customer ledger. Every tenant-scoped table carries business_id and
-- is indexed on it, because every query in the app is tenant filtered.

CREATE TABLE businesses (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  name         VARCHAR(120) NOT NULL,
  owner_name   VARCHAR(120) NOT NULL,
  phone        VARCHAR(20)  NOT NULL,
  city         VARCHAR(80)  NOT NULL,
  plan         VARCHAR(20)  NOT NULL DEFAULT 'TRIAL',
  currency     VARCHAR(3)   NOT NULL DEFAULT 'INR',
  created_at   DATETIME(6)  NOT NULL,
  PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE users (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  business_id   BIGINT       NOT NULL,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL,
  phone         VARCHAR(20)  NULL,
  password_hash VARCHAR(100) NOT NULL,
  role          VARCHAR(20)  NOT NULL,
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email),
  KEY idx_users_business (business_id),
  CONSTRAINT fk_users_business FOREIGN KEY (business_id) REFERENCES businesses (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE routes (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  business_id BIGINT       NOT NULL,
  name        VARCHAR(80)  NOT NULL,
  agent_id    BIGINT       NULL,
  depot_label VARCHAR(160) NOT NULL,
  depot_lat   DOUBLE       NOT NULL,
  depot_lng   DOUBLE       NOT NULL,
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_routes_business_name (business_id, name),
  KEY idx_routes_agent (agent_id),
  CONSTRAINT fk_routes_business FOREIGN KEY (business_id) REFERENCES businesses (id),
  CONSTRAINT fk_routes_agent FOREIGN KEY (agent_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE customers (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  business_id BIGINT       NOT NULL,
  route_id    BIGINT       NULL,
  name        VARCHAR(120) NOT NULL,
  phone       VARCHAR(20)  NOT NULL,
  address     VARCHAR(255) NOT NULL,
  landmark    VARCHAR(120) NULL,
  lat         DOUBLE       NOT NULL,
  lng         DOUBLE       NOT NULL,
  notes       VARCHAR(255) NULL,
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  joined_on   DATE         NOT NULL,
  created_at  DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_customers_business_phone (business_id, phone),
  KEY idx_customers_business_active (business_id, active),
  KEY idx_customers_route (route_id),
  KEY idx_customers_name (business_id, name),
  CONSTRAINT fk_customers_business FOREIGN KEY (business_id) REFERENCES businesses (id),
  CONSTRAINT fk_customers_route FOREIGN KEY (route_id) REFERENCES routes (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE products (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  business_id BIGINT       NOT NULL,
  name        VARCHAR(120) NOT NULL,
  unit_label  VARCHAR(40)  NOT NULL,
  category    VARCHAR(40)  NOT NULL,
  price_paise BIGINT       NOT NULL,
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_products_business_name (business_id, name),
  KEY idx_products_business_active (business_id, active),
  CONSTRAINT fk_products_business FOREIGN KEY (business_id) REFERENCES businesses (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE subscriptions (
  id           BIGINT      NOT NULL AUTO_INCREMENT,
  business_id  BIGINT      NOT NULL,
  customer_id  BIGINT      NOT NULL,
  product_id   BIGINT      NOT NULL,
  quantity     INT         NOT NULL,
  frequency    VARCHAR(20) NOT NULL,
  weekday_mask INT         NOT NULL DEFAULT 127,
  start_on     DATE        NOT NULL,
  end_on       DATE        NULL,
  active       TINYINT(1)  NOT NULL DEFAULT 1,
  created_at   DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_subs_business_active (business_id, active),
  KEY idx_subs_customer (customer_id, active),
  KEY idx_subs_product (product_id),
  CONSTRAINT fk_subs_business FOREIGN KEY (business_id) REFERENCES businesses (id),
  CONSTRAINT fk_subs_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_subs_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Closed date intervals loaded into the in-memory interval tree at run planning.
CREATE TABLE delivery_pauses (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  business_id     BIGINT       NOT NULL,
  customer_id     BIGINT       NOT NULL,
  subscription_id BIGINT       NULL,
  start_on        DATE         NOT NULL,
  end_on          DATE         NOT NULL,
  reason          VARCHAR(120) NULL,
  created_at      DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_pauses_customer (customer_id, start_on, end_on),
  KEY idx_pauses_business_window (business_id, start_on, end_on),
  KEY idx_pauses_subscription (subscription_id),
  CONSTRAINT fk_pauses_business FOREIGN KEY (business_id) REFERENCES businesses (id),
  CONSTRAINT fk_pauses_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_pauses_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE delivery_runs (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  business_id     BIGINT      NOT NULL,
  route_id        BIGINT      NOT NULL,
  run_date        DATE        NOT NULL,
  status          VARCHAR(20) NOT NULL,
  total_stops     INT         NOT NULL DEFAULT 0,
  completed_stops INT         NOT NULL DEFAULT 0,
  planned_metres  INT         NOT NULL DEFAULT 0,
  greedy_metres   INT         NOT NULL DEFAULT 0,
  baseline_metres INT         NOT NULL DEFAULT 0,
  two_opt_swaps   INT         NOT NULL DEFAULT 0,
  distance_model  VARCHAR(20) NOT NULL DEFAULT 'ROAD_APPROX',
  sequenced_at    DATETIME(6) NULL,
  created_at      DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_runs_route_date (route_id, run_date),
  KEY idx_runs_business_date (business_id, run_date),
  CONSTRAINT fk_runs_business FOREIGN KEY (business_id) REFERENCES businesses (id),
  CONSTRAINT fk_runs_route FOREIGN KEY (route_id) REFERENCES routes (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE delivery_stops (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  business_id  BIGINT       NOT NULL,
  run_id       BIGINT       NOT NULL,
  customer_id  BIGINT       NOT NULL,
  seq          INT          NOT NULL,
  status       VARCHAR(20)  NOT NULL,
  amount_paise BIGINT       NOT NULL DEFAULT 0,
  leg_metres   INT          NOT NULL DEFAULT 0,
  delivered_at DATETIME(6)  NULL,
  note         VARCHAR(200) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_stops_run_customer (run_id, customer_id),
  KEY idx_stops_run_seq (run_id, seq),
  KEY idx_stops_customer (customer_id),
  KEY idx_stops_business_status (business_id, status),
  CONSTRAINT fk_stops_run FOREIGN KEY (run_id) REFERENCES delivery_runs (id) ON DELETE CASCADE,
  CONSTRAINT fk_stops_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_stops_business FOREIGN KEY (business_id) REFERENCES businesses (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE delivery_stop_items (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  stop_id          BIGINT       NOT NULL,
  product_id       BIGINT       NOT NULL,
  product_name     VARCHAR(120) NOT NULL,
  quantity         INT          NOT NULL,
  unit_price_paise BIGINT       NOT NULL,
  line_total_paise BIGINT       NOT NULL,
  PRIMARY KEY (id),
  KEY idx_items_stop (stop_id),
  KEY idx_items_product (product_id),
  CONSTRAINT fk_items_stop FOREIGN KEY (stop_id) REFERENCES delivery_stops (id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE invoices (
  id                BIGINT      NOT NULL AUTO_INCREMENT,
  business_id       BIGINT      NOT NULL,
  customer_id       BIGINT      NOT NULL,
  period_start      DATE        NOT NULL,
  period_end        DATE        NOT NULL,
  subtotal_paise    BIGINT      NOT NULL DEFAULT 0,
  adjustment_paise  BIGINT      NOT NULL DEFAULT 0,
  total_paise       BIGINT      NOT NULL DEFAULT 0,
  paid_paise        BIGINT      NOT NULL DEFAULT 0,
  status            VARCHAR(20) NOT NULL,
  issued_on         DATE        NOT NULL,
  due_on            DATE        NOT NULL,
  created_at        DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_invoice_customer_period (customer_id, period_start, period_end),
  KEY idx_invoices_business_status (business_id, status),
  KEY idx_invoices_due (business_id, due_on),
  CONSTRAINT fk_invoices_business FOREIGN KEY (business_id) REFERENCES businesses (id),
  CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE invoice_lines (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  invoice_id       BIGINT       NOT NULL,
  product_name     VARCHAR(120) NOT NULL,
  quantity         INT          NOT NULL,
  unit_price_paise BIGINT       NOT NULL,
  amount_paise     BIGINT       NOT NULL,
  PRIMARY KEY (id),
  KEY idx_lines_invoice (invoice_id),
  CONSTRAINT fk_lines_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE payments (
  id           BIGINT      NOT NULL AUTO_INCREMENT,
  business_id  BIGINT      NOT NULL,
  customer_id  BIGINT      NOT NULL,
  invoice_id   BIGINT      NULL,
  amount_paise BIGINT      NOT NULL,
  mode         VARCHAR(20) NOT NULL,
  paid_on      DATE        NOT NULL,
  reference    VARCHAR(80) NULL,
  created_at   DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_payments_business_date (business_id, paid_on),
  KEY idx_payments_customer (customer_id, paid_on),
  KEY idx_payments_invoice (invoice_id),
  CONSTRAINT fk_payments_business FOREIGN KEY (business_id) REFERENCES businesses (id),
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;




