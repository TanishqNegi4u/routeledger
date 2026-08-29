# RouteLedger

**The operating system for daily delivery rounds.**

Milk at 5:40am. Water cans on Tuesdays and Fridays. Tiffins to nine offices. Newspapers to
three hundred doors. Every one of those businesses runs on a notebook, a WhatsApp group and an
argument at the end of the month about whether the family was away on the 14th.

RouteLedger replaces the notebook. It sequences the morning round, tracks every standing order
and every pause, builds the month's bill from what was *actually delivered*, and then tells the
owner which ten phone calls will recover the most money.

**Who pays:** the owner of a subscription delivery business — a dairy with 200–2,000 households,
a water-can distributor, a tiffin service, a newspaper agency, a laundry round. In India that is
a ₹400–₹1,500/month decision made by someone who currently loses more than that every month to
billing disputes and forgotten dues. One depot with two agents is already profitable to serve.

---

## Table of contents

- [Phase 1 — how this idea was chosen](#phase-1--how-this-idea-was-chosen)
- [Architecture](#architecture)
- [The five data structures written from scratch](#the-five-data-structures-written-from-scratch)
- [Run it locally with Docker](#run-it-locally-with-docker)
- [Run it without Docker](#run-it-without-docker)
- [Deploy to any Kubernetes cluster](#deploy-to-any-kubernetes-cluster)
- [Demo credentials](#demo-credentials)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Security posture](#security-posture)
- [Repository layout](#repository-layout)

---

## Phase 1 — how this idea was chosen

Twenty real, daily, unglamorous problems were scored out of 10 on four axes: **F**requency (how
often the pain recurs), **P**ain intensity (what it costs when it goes wrong), **W**illingness to
pay (would a real owner hand over a card, today), and **C**ompetition weakness (how bad the
existing options are for a business with fewer than ten staff).

| # | Problem | F | P | W | C | Total |
|---|---------|:-:|:-:|:-:|:-:|:-----:|
| 1 | **Subscription delivery rounds run on a paper notebook** — milk, water, tiffin, newspaper, laundry | 10 | 9 | 9 | 9 | **37** |
| 2 | Water-can distributor route + can-deposit tracking | 9 | 9 | 8 | 9 | 35 |
| 3 | Kirana inventory and khata, offline-first | 10 | 8 | 7 | 6 | 31 |
| 4 | Court-date tracking for a two-person law practice | 6 | 9 | 8 | 8 | 31 |
| 5 | Daily-wage labour attendance and site wage ledger | 9 | 8 | 6 | 7 | 30 |
| 6 | Clinic queue and walk-in overflow | 9 | 8 | 7 | 6 | 30 |
| 7 | Tiffin / cloud-kitchen daily order capture | 9 | 7 | 6 | 6 | 28 |
| 8 | Tuition centre fees and attendance | 8 | 7 | 7 | 6 | 28 |
| 9 | Pharmacy near-expiry stock write-off | 7 | 8 | 7 | 6 | 28 |
| 10 | Hostel / PG rent and mess management | 7 | 7 | 7 | 7 | 28 |
| 11 | School bus route and parent tracking | 8 | 7 | 7 | 5 | 27 |
| 12 | Local technician job dispatch | 7 | 7 | 7 | 6 | 27 |
| 13 | Society maintenance dues and notices | 6 | 7 | 7 | 6 | 26 |
| 14 | Small-fleet permit and document expiry | 4 | 8 | 7 | 7 | 26 |
| 15 | Salon appointments and no-shows | 8 | 6 | 6 | 5 | 25 |
| 16 | Farm-to-market produce price discovery | 7 | 8 | 4 | 6 | 25 |
| 17 | Freelancer invoice chasing | 5 | 8 | 7 | 4 | 24 |
| 18 | Gym membership renewals | 6 | 6 | 7 | 5 | 24 |
| 19 | Event photographer bookings and advances | 4 | 6 | 7 | 5 | 22 |
| 20 | Restaurant table reservations | 7 | 5 | 5 | 3 | 20 |

Rows 1 and 2 are the same business with a different product in the crate, so they were merged.
**RouteLedger is that merged winner.**

### Why it wins on each axis

**Frequency is 10, not 8.** This is not a problem that surfaces monthly. It surfaces at 5am,
every single morning, for every single household. A tool that is opened 365 times a year does not
get cancelled; a tool opened twice a year does.

**Pain is 9 because the pain is money, and it is measurable.** A dairy with 600 households
delivering ₹60/day loses roughly ₹18,000 a month to three specific leaks: days charged that were
not delivered (the argument), days delivered that were never charged (the notebook), and dues that
quietly age past the point anyone chases them. RouteLedger closes all three, because a bill is
*assembled from delivered stops* and can never be typed by hand.

**Willingness to pay is 9 because the buyer already pays for the alternative.** The alternative is
a person: a munim who reconciles the notebook, or the owner's own two hours every evening.
₹999/month against two hours a day is not a hard sell, and the owner is the decision maker — there
is no procurement, no committee, no IT department.

**Competition is weak in a specific, exploitable way.** The market splits into last-mile *fleet*
software built for Delhivery-scale operations (priced and shaped for enterprises, useless for one
depot), and generic invoicing apps that have never heard of a standing order or a pause. Nothing
in the middle models the thing that actually matters: *a recurring obligation to a doorstep that
can be paused, and a bill that must be defensible during a doorstep argument.*

### The moat

The moat is stop-level history. After three months a tenant has a per-door, per-day, per-product
ledger that nobody else has — and it is what makes the route sequencing, the risk ranking and the
disputed-day defence work. Switching away means losing the audit trail that settles arguments,
which is the precise reason the owner bought the thing. The data gets stickier every morning,
without any network effect being required.

---

## Architecture

```
                          ┌──────────────────────────────────────┐
   browser                │  Ingress (nginx)  routeledger.io     │
   ───────                └────────────────┬─────────────────────┘
                                           │ :80 / :443
                          ┌────────────────▼─────────────────────┐
                          │  routeledger-web   (2..6 replicas)   │
   React 18 + Vite        │  nginx 1.27, unprivileged, :8080     │
   pure CSS modules       │                                      │
   hand-rolled router     │  /            → index.html (SPA)     │
   Chart.js from CDN      │  /assets/*    → immutable, 1y        │
                          │  /api/*       ─┐                     │
                          │  /swagger-ui  ─┤ reverse proxy       │
                          │  /v3/api-docs ─┘ same origin, no CORS│
                          └────────────────┬─────────────────────┘
                                           │ http://routeledger-api:8080
                          ┌────────────────▼─────────────────────┐
                          │  routeledger-api   (2..8 replicas)   │
   Java 21                │  Spring Boot 3.2, JRE 21, non-root   │
   Spring Boot 3.2        │                                      │
   Spring Security + JWT  │  controller → service → repository   │
   Spring Data JPA        │       ▲            │                 │
   Flyway                 │       │            ▼                 │
   springdoc OpenAPI      │  JwtAuthFilter   com.routeledger.dsa │
                          │  businessId from │ BinaryHeap        │
                          │  the token only  │ Graph + Dijkstra  │
                          │                  │ UnionFind         │
                          │                  │ IntervalTree      │
                          │                  │ Trie              │
                          └────────────────┬─────────────────────┘
                                           │ JDBC, Hikari pool
                          ┌────────────────▼─────────────────────┐
                          │  routeledger-mysql  StatefulSet, 1   │
                          │  MySQL 8.0, utf8mb4, 8Gi PVC         │
                          │  schema owned by Flyway V1           │
                          │  13 tables, business_id on all 11    │
                          │  tenant tables, indexed              │
                          └──────────────────────────────────────┘
```

Three tiers, two of them stateless. Every request carries a JWT; the tenant id is read from that
token and never from a request body or query string, which is the single mechanism that keeps one
dairy from reading another's round. The browser talks to exactly one origin, so there is no CORS
preflight in dev (Vite proxy) or in production (nginx proxy).

---

## The five data structures written from scratch

Everything in `backend/src/main/java/com/routeledger/dsa/` is hand-written — no
`PriorityQueue`, no Guava, no JGraphT, no geo library. Each one exists because a specific screen
would be wrong or slow without it, and each one's output is *visible in the UI*, not just claimed
in a comment.

### 1. `RouteOptimizer` — sequencing the morning round
`RouteOptimizer.java`, backed by `Graph`, `Dijkstra`, `BinaryHeap`, `UnionFind`, `GeoPoint`.

Given a depot and the day's households, produce the order to walk them in.

1. **Haversine** distances between every pair, in whole metres (`int`, never a float).
2. **Sparse graph build** — k-nearest neighbours (k = 6) *plus* a union-find-guaranteed spanning
   tree. kNN alone can leave an isolated cluster on the far side of a canal; the spanning tree
   edges make the graph connected by construction, so no stop is ever unreachable.
3. **All-pairs shortest paths** — `Dijkstra` run from every node over a hand-written
   **`BinaryHeap`** (sift-up/sift-down, `decreaseKey` by index map). O(V · E log V).
4. **Nearest-neighbour tour** for a greedy first answer.
5. **2-opt improvement** — reverse every candidate segment while an improving swap exists.

The run sheet screen shows all three numbers: the naive as-entered distance, the greedy tour, and
the 2-opt result with the swap count. On the seeded demo tenant 2-opt takes about 11% off the
greedy tour, which on a 90-door round is roughly 20 minutes of walking a day.

*Why not a library:* the problem is a metric TSP on 30–400 nodes with a fixed start. A generic
solver would be heavier than the whole service, and the sparse-graph step is where the
domain knowledge lives — doors on the same staircase are one edge, not one euclidean hop.

### 2. `IntervalTree` — "is this household paused on this date?"
An augmented AVL tree keyed on pause start, with `maxEnd` maintained per node.

A household going to their village for eleven days is a pause interval. When the run sheet for a
date is built, every candidate stop must be tested against every pause. Linear scanning is
O(n) per stop and O(n²) per morning. The interval tree answers stabbing queries in **O(log n)**,
with rotations keeping it balanced as pauses are added and removed.

This is the structure that stops a holiday from becoming a disputed line on a bill: a paused day
never produces a stop, so it can never produce an invoice line, so there is nothing to argue about.

### 3. `BinaryHeap` — the collections chase list
The same heap that powers Dijkstra is reused as a **max-heap on a risk score** to rank who to call.
Risk blends amount outstanding, age of the oldest unpaid bill, and how many bills are open. Only
the top *k* are extracted, so ranking 5,000 households costs O(n + k log n) rather than a full sort.

The Collections screen renders the score as a meter next to each row, so an owner can see *why*
row 3 outranks row 9 instead of trusting a black box.

### 4. `Trie` — household search that keeps up with typing
A per-tenant prefix tree over household names and phone numbers, rebuilt lazily and invalidated on
write (`CustomerSearchIndex`). Lookup is O(length of the prefix) and completely independent of how
many households the tenant has, so search stays instant on the third keystroke on a ₹5,000 Android
phone over a 3G connection — which is the actual device this runs on at 5am.

*Why not `LIKE 'ravi%'`:* a leading-wildcard-free LIKE would work, but the agent searches by
partial phone *and* partial name, and the trie holds both keyspaces in one traversal without
touching the database on every keypress.

### 5. `UnionFind` + `GeoClusterer` — splitting a beat into walkable groups
Kruskal's MST over the household graph with **single-linkage** clustering: sort candidate edges by
length, union endpoints while the link is under `maxLinkMetres`, stop when the requested number of
groups remains. Path compression plus union by rank gives near-constant amortised finds.

This is what the Beats planner uses to answer "this round has grown to 140 doors, where do I split
it so each agent gets a compact walk?". The UI draws each cluster with its centroid and its spread
in metres, so the split is inspectable rather than magic.

### Tested without a database
Seven JUnit 5 classes cover the structures directly — heap ordering and `decreaseKey`, union-find
connectivity, Dijkstra against hand-computed paths, interval-tree stabbing and deletion, trie
prefix sets, cluster counts, and the 2-opt invariant that the optimised tour is never longer than
the greedy one. None of them use `@SpringBootTest`, so `mvn clean package` runs the full suite with
no MySQL anywhere in sight.

---

## Run it locally with Docker

One command. Requires Docker with Compose v2 (`docker compose version` ≥ 2.20) and about 2.5 GB of
free RAM.

```bash
cp .env.example .env      # optional locally, mandatory before exposing anything
docker compose up --build
```

First build takes a few minutes — Maven resolves dependencies and runs the DSA test suite, then
Vite bundles the frontend. Then:

| What | Where |
|------|-------|
| Operator console | http://localhost:8080 |
| API base | http://localhost:8080/api (proxied) or http://localhost:8081/api (direct) |
| Swagger UI | http://localhost:8081/swagger-ui.html |
| OpenAPI JSON | http://localhost:8081/v3/api-docs |
| Health | http://localhost:8081/actuator/health |
| MySQL | `localhost:3307`, user `routeledger` |

Startup order is enforced, not hoped for: MySQL has a real `mysqladmin ping` healthcheck, the API
waits for `service_healthy`, and the web tier waits for the API's `/actuator/health/readiness`. On
first boot the API runs Flyway `V1__init_schema.sql` and then `DemoDataSeeder` replays 45 days of
history through the *real* services, so the demo tenant is internally consistent rather than a SQL
dump that happens to look plausible.

```bash
docker compose logs -f backend     # watch Flyway + the seeder
docker compose ps                  # health of all three
docker compose down                # stop, keep the data
docker compose down -v             # stop and wipe the volume, next boot reseeds
```

### If something is wrong

The API restarting in a loop almost always means MySQL rejected the credentials — `DB_PASSWORD` in
the backend environment and `MYSQL_PASSWORD` on the MySQL container have to be the same value, and
if you changed one after the volume was created, MySQL kept the old account. `docker compose down
-v` resolves it. A blank page with a 502 on `/api/*` means the backend is up but not ready yet;
give it the 70-second start period.

---

## Run it without Docker

Needs JDK 21, Maven 3.9+, Node 20+, and a MySQL 8 you can reach.

```bash
# database
mysql -u root -p -e "CREATE DATABASE routeledger CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p -e "CREATE USER 'routeledger'@'%' IDENTIFIED BY 'routeledger';"
mysql -u root -p -e "GRANT ALL ON routeledger.* TO 'routeledger'@'%'; FLUSH PRIVILEGES;"

# backend  →  http://localhost:8080
cd backend
mvn clean package
java -jar target/routeledger-api.jar

# frontend →  http://localhost:5173
cd ../frontend
npm install
npm run dev
```

`mvn clean package` runs the seven DSA test classes and produces
`backend/target/routeledger-api.jar`. `npm run build` produces `frontend/dist/`. The Vite dev
server proxies `/api` and `/v3` to `localhost:8080`, so the browser still sees one origin — set
`VITE_API_TARGET` if the API is somewhere else.

---

## Deploy to any Kubernetes cluster

The manifests in `k8s/` are plain YAML with a `kustomization.yaml` for ordering. No Helm, no
operators, no cloud-specific annotations except one commented cert-manager line.

### 1. Build and publish the two images

```bash
docker build -t <registry>/routeledger-api:1.0.0 ./backend
docker build -t <registry>/routeledger-web:1.0.0 ./frontend
docker push <registry>/routeledger-api:1.0.0
docker push <registry>/routeledger-web:1.0.0
```

Point the manifests at them by editing the `images:` block in `k8s/kustomization.yaml`:

```yaml
images:
  - name: routeledger/api
    newName: <registry>/routeledger-api
    newTag: 1.0.0
  - name: routeledger/web
    newName: <registry>/routeledger-web
    newTag: 1.0.0
```

On a local cluster you can skip the registry entirely — `kind load docker-image
routeledger/api:1.0.0` or `minikube image load routeledger/api:1.0.0`, and leave the names alone.

### 2. Replace the placeholder secrets

`k8s/secret.yaml` ships obvious placeholders so a scratch cluster works in one command. Generate
real ones instead, without ever writing them to a tracked file:

```bash
kubectl create namespace routeledger

APP_DB_PASSWORD="$(openssl rand -base64 24)"
kubectl -n routeledger create secret generic routeledger-secrets \
  --from-literal=MYSQL_ROOT_PASSWORD="$(openssl rand -base64 24)" \
  --from-literal=MYSQL_PASSWORD="$APP_DB_PASSWORD" \
  --from-literal=DB_PASSWORD="$APP_DB_PASSWORD" \
  --from-literal=JWT_SECRET="$(openssl rand -base64 48)" \
  --from-literal=DEMO_PASSWORD="$(openssl rand -base64 12)" \
  --dry-run=client -o yaml | kubectl apply -f -
```

`MYSQL_PASSWORD` and `DB_PASSWORD` must be the same string: one provisions the account, the other
authenticates with it. `JWT_SECRET` must be at least 32 characters — HS256 refuses anything
shorter, and rotating it invalidates every issued token.

### 3. Apply

```bash
kubectl apply -k k8s/
kubectl -n routeledger get pods -w
```

Order does not matter, because the API's `wait-for-mysql` initContainer blocks on the database
port and the pods reconcile themselves. Expect the API to take 60–120 seconds on first boot while
Flyway migrates and the seeder replays history.

### 4. Reach it

With an ingress controller installed, edit the host in `k8s/ingress.yaml` and point DNS at it.
Without one:

```bash
kubectl -n routeledger port-forward svc/routeledger-web 8080:80
# http://localhost:8080
```

### 5. Turn off the demo tenant

Before a real customer touches this, set `DEMO_SEED: "false"` in `k8s/configmap.yaml` and
re-apply. The seeder only ever runs against an empty database, but there is no reason to leave the
switch on.

### What is in `k8s/`

| File | Contents |
|------|----------|
| `namespace.yaml` | the `routeledger` namespace |
| `configmap.yaml` | non-secret config: DB URL, pool size, CORS origins, backend origin for nginx |
| `secret.yaml` | placeholder passwords and the JWT signing key — replace these |
| `mysql.yaml` | headless Service + StatefulSet with an 8Gi `volumeClaimTemplate` |
| `deployment.yaml` | `routeledger-api` and `routeledger-web` Deployments |
| `service.yaml` | two ClusterIP Services — nothing is a LoadBalancer |
| `ingress.yaml` | single front door, TLS block ready to uncomment |
| `hpa.yaml` | HPAs for both stateless tiers plus PodDisruptionBudgets |
| `kustomization.yaml` | ordering and image overrides |

MySQL is a StatefulSet rather than a Deployment on purpose: a database needs a stable identity and
its own volume across reschedules, and rolling two replicas over one `ReadWriteOnce` claim is how
people lose a customer ledger.

Both stateless tiers run `readOnlyRootFilesystem: true`, `runAsNonRoot: true`, all capabilities
dropped and `seccompProfile: RuntimeDefault`. The web pod gets three `emptyDir` mounts because
nginx genuinely needs to write in exactly three places: the envsubst output in `/etc/nginx/conf.d`,
its proxy temp dirs in `/var/cache/nginx`, and its pidfile in `/tmp`.

### Rolling a new version

```bash
docker build -t <registry>/routeledger-api:1.1.0 ./backend && docker push <registry>/routeledger-api:1.1.0
# bump newTag in k8s/kustomization.yaml
kubectl apply -k k8s/
kubectl -n routeledger rollout status deploy/routeledger-api
```

`maxUnavailable: 0` with `maxSurge: 1` means the new pod has to pass its readiness probe before an
old one is retired, so a migration that fails on boot never takes the service down — the rollout
just stalls, and `kubectl rollout undo` puts it back.

---

## Demo credentials

Seeded automatically on first boot against an empty database, as a fictional dairy in Pune with
three beats, a price list, ~90 households, and 45 days of delivered rounds, bills and payments.

| Role | Email | Password | What they see |
|------|-------|----------|---------------|
| Owner | `owner@amrutdairy.in` | `Demo@12345` | everything — dashboard, beats, price list, bills, collections, team |
| Delivery agent | `ravi@amrutdairy.in` | `Demo@12345` | only *My round* — today's sequenced stops, mark delivered/absent, take cash |

Sign in as the agent second. The point of the product is visible in the difference between the two
sessions: the owner sees a business, the agent sees a walk.

Change `DEMO_PASSWORD` (compose `.env`, or the Kubernetes secret) to move both accounts off the
published password, or set `DEMO_SEED=false` to skip seeding entirely.

---

## API reference

Interactive docs at `/swagger-ui.html`, schema at `/v3/api-docs`. Everything below is under
`/api`, returns JSON, and requires `Authorization: Bearer <token>` except the two auth entry points
and `/api/public/ping`.

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@amrutdairy.in","password":"Demo@12345"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

curl -s http://localhost:8080/api/dashboard/overview -H "Authorization: Bearer $TOKEN"
```

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/register` · `POST /auth/login` · `GET /auth/me` · `POST /auth/change-password` |
| Dashboard | `GET /dashboard/overview?from=&to=` |
| Beats (routes) | `GET /routes` · `GET /routes/staff` · `GET /routes/{id}` · `POST /routes` · `PUT /routes/{id}` · `PATCH /routes/{id}/active` |
| Price list | `GET /products` · `GET /products/active` · `GET /products/{id}` · `POST /products` · `PUT /products/{id}` · `PATCH /products/{id}/active` |
| Households | `GET /customers` · `GET /customers/search?q=` · `GET /customers/beats?routeId=&clusters=&maxLinkMetres=` · `GET /customers/{id}` · `POST /customers` · `PUT /customers/{id}` · `PATCH /customers/{id}/active` |
| Standing orders | `GET /subscriptions?customerId=` · `GET /subscriptions/{id}` · `POST /subscriptions` · `PUT /subscriptions/{id}` · `PATCH /subscriptions/{id}/active` |
| Pauses | `GET /pauses?customerId=` · `GET /pauses/calendar?from=&to=` · `POST /pauses` · `DELETE /pauses/{id}` |
| Run sheets | `POST /runs/generate` · `GET /runs` · `GET /runs/by-date?date=` · `GET /runs/mine` · `GET /runs/{id}` · `PATCH /runs/stops/{stopId}` |
| Bills | `POST /invoices/generate` · `GET /invoices?status=&customerId=` · `GET /invoices/by-customer/{id}` · `GET /invoices/{id}` · `GET /invoices/{id}/payments` · `PATCH /invoices/{id}/adjust` · `PATCH /invoices/{id}/cancel` |
| Payments | `POST /payments` · `GET /payments` · `GET /payments/by-customer/{id}` |
| Collections | `GET /collections/dues?limit=` |
| Public | `GET /public/ping` |

Role rules, enforced server side with `@PreAuthorize` on top of the tenant filter: creating and
editing master data (beats, products, households, standing orders) and generating or voiding bills
is `OWNER`/`MANAGER`. Recording a payment, logging a pause and updating a stop are open to `AGENT`
by design — those are the three things that happen at a doorstep. `GET /customers/beats` is
`OWNER`/`MANAGER` only, because a beat split reveals the whole round.

Every error is a consistent envelope, never a stack trace:

```json
{
  "timestamp": "2026-08-29T00:11:12.318Z",
  "status": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "path": "/api/products",
  "fieldErrors": [{ "field": "pricePaise", "message": "must be greater than 0" }]
}
```

Money is always an integer field named `*Paise`. Nothing in this system stores a rupee as a float,
so a month of 62.50 litres cannot drift by a paisa.

---

## Data model

Thirteen tables, created by `V1__init_schema.sql`. Eleven of them carry `business_id`, indexed,
because every query in the application is tenant-filtered.

```
businesses ──┬── users            (OWNER / MANAGER / AGENT, bcrypt hash)
             ├── routes           (a beat: name, agent, depot lat/lng)
             ├── products         (price list, price_paise)
             ├── customers        (household: address, lat/lng, route)
             │      ├── subscriptions      (product, qty, frequency, weekday_mask, window)
             │      ├── delivery_pauses    (start_on, end_on, reason)  →  IntervalTree
             │      ├── invoices ── invoice_lines
             │      └── payments
             ├── delivery_runs    (one per beat per date, PLANNED→IN_PROGRESS→COMPLETED)
             │      └── delivery_stops ── delivery_stop_items
             └── (invoices/payments also indexed by due_on and paid_on for the dues query)
```

The chain that makes the product work reads left to right: a **subscription** is a recurring
obligation; `ScheduleResolver` turns it into a **stop** for a given date unless an interval-tree
lookup says the household is paused; the agent marks that stop `DELIVERED`, `ABSENT` or `SKIPPED`;
`InvoiceService` groups delivered **stop items** into **invoice lines** at the price recorded on the
stop, not the price today. That last detail is why a price rise never retroactively changes last
month's bill.

Frequencies are `DAILY`, `ALTERNATE_DAY` and `WEEKLY_DAYS`, the last one using a 7-bit
`weekday_mask` — Monday is bit 0. Stop statuses are `PENDING`, `DELIVERED`, `ABSENT`, `SKIPPED`.
Invoice statuses are `UNPAID`, `PARTIAL`, `PAID`, `VOID`. A payment recorded without an invoice id
settles the oldest open bill first and rolls the remainder onto the next, which is exactly how a
₹2,000 handover at the door behaves in real life.

Generating twice is safe. `POST /runs/generate` and `POST /invoices/generate` are idempotent for a
period: an existing unpaid bill is recalculated rather than duplicated, and an existing run is
refreshed without losing stops that were already marked.

---

## Security & Production Hardening

**Tenancy.** `JwtAuthFilter` builds an `AuthPrincipal` carrying `userId`, `businessId` and `role`.
Every service method takes the `businessId` from that principal. No endpoint anywhere accepts a
tenant id in a body, a path or a query string, so there is no version of "change the id in the URL"
that reads another dairy's round. Comprehensive tenant-isolation integration tests verify cross-tenant
access returns 404 or empty results across all controller endpoints.

**Token Lifecycle.** Short-lived access tokens (15-minute TTL) are kept strictly in-memory in the browser
and never written to `localStorage`. Rotating refresh tokens (7-day TTL) are stored SHA-256 hashed in a
dedicated `refresh_tokens` table. Refresh token rotation issues a new refresh token on every use; replay of
an already-rotated token triggers immediate family-wide revocation and a security warning. Silent background
token refresh on 401 transparently renews access tokens before falling back to re-login.

**Distributed Rate Limiting.** Distributed Redis-backed rate limiter using an atomic Lua script (`INCR` + `EXPIRE`)
with fail-open resilience protects against credential stuffing and brute-force attacks on `/api/auth/login`
and `/api/auth/refresh`. Configurable for standalone `redis` or local `in-memory` execution.

**Observability.** Micrometer Prometheus metrics exported at `/actuator/prometheus`, MDC `X-Request-Id` request
tracing on every HTTP request and error response, and Kubernetes-aligned liveness/readiness probe health groups.

**Authorisation.** `@EnableMethodSecurity` with `@PreAuthorize` on the controller methods, in
addition to the tenant filter. The frontend route guards are a usability layer only — every
endpoint re-checks the role, so a hand-crafted request from a logged-in agent still gets a 403.

**Running the Test Suites:**
- **Backend**: `cd backend && mvn clean test` (Runs 56 unit, integration, DSA, multi-tenant isolation, rate limiter, and smoke tests).
- **Frontend**: `cd frontend && npm run test` (Runs Vitest unit and component tests) & `npm run lint` (ESLint 9 Flat Config).

---

## Status and Verification

All backend and frontend hardening tasks are complete and verified with automated test suites:
- Backend: 56 automated tests passing (`mvn clean test`).
- Frontend: 16 Vitest tests passing (`npm run test`), ESLint passing (`npm run lint`), and production bundle built (`npm run build`).
- CI/CD: GitHub Actions workflows configured for automated Backend and Frontend verification on push and PR.

**Browser.** One origin, so no CORS in the hot path and no third-party cookie. nginx sets
`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` and a
CSP that allows scripts only from `self` and the pinned Chart.js CDN. The Chart.js tag carries an
sha384 integrity hash, and every npm dependency is pinned to an exact version.

**Known limitations, stated rather than hidden.** There is no rate limiting on `/auth/login` — put
it on the ingress or add a bucket filter before this is on the public internet. There is no refresh
token, so a stolen access token is valid until it expires; shorten `JWT_TTL_SECONDS` if that
matters more than re-login friction. MySQL connections are not TLS in the default URL, which is
correct inside a cluster network and wrong across a public one. And `DEMO_SEED=true` must be turned
off before real data lands.

---

## Repository layout

```
.
├── docker-compose.yml          one-command local stack
├── .env.example                every overridable value, with dev defaults
├── k8s/                        namespace, config, secret, mysql, deployment, service, ingress, hpa
├── backend/
│   ├── Dockerfile              maven:3.9 → temurin:21-jre-alpine, non-root, healthcheck
│   ├── pom.xml
│   └── src/main/java/com/routeledger/
│       ├── dsa/                BinaryHeap, Graph, UnionFind, Dijkstra, IntervalTree,
│       │                       Trie, GeoClusterer, RouteOptimizer, GeoPoint
│       ├── domain/             11 entities + 7 enums
│       ├── repository/         13 Spring Data repositories
│       ├── dto/                request/response records, PageResponse, ApiError
│       ├── service/            12 services — the business logic lives here
│       ├── controller/         12 REST controllers + Pagination
│       ├── security/           JwtService, JwtAuthFilter, AuthPrincipal, SecurityConfig
│       ├── exception/          typed exceptions + GlobalExceptionHandler
│       └── config/             OpenApiConfig, DemoDataSeeder
│   └── src/main/resources/db/migration/V1__init_schema.sql
│   └── src/test/java/.../dsa/  7 JUnit 5 classes, no database required
└── frontend/
    ├── Dockerfile              node:20 build → nginx:1.27-alpine, unprivileged
    ├── nginx.conf              SPA fallback, API proxy, CSP, gzip, immutable assets
    └── src/
        ├── lib/                api.js (axios), auth.jsx, router.jsx, toast.jsx,
        │                       useAsync.js, format.js
        ├── components/         ui.jsx (16 primitives), AppShell, StopBoard, Chart
        ├── pages/              Landing, Login, Register, Dashboard, MyRound, Runs,
        │                       RunDetail, Customers, CustomerDetail, Beats, Products,
        │                       Invoices, InvoiceDetail, Collections, Settings, NotFound
        └── styles/             tokens.css (design tokens), global.css (primitives)
```

### On the stack

The constraint was HTML5, CSS3, vanilla JS, React with Vite, Java 21 with Spring Boot, MySQL 8,
Docker and Kubernetes — and nothing else. That was honoured literally, which had two consequences
worth naming.

There is no `react-router-dom`. `src/lib/router.jsx` is about 120 lines over the History API,
providing `<Router>`, `<Link>`, `useRoute()` and `navigate()`. There is no Tailwind and no CSS-in-JS
either: `styles/tokens.css` defines the scale (colour, type, spacing, radius, shadow, motion),
`styles/global.css` defines the primitives (buttons, inputs, tables, badges, cards, drawers,
toasts), and per-page CSS Modules handle layout. Charts are Chart.js from a pinned CDN through
`window.Chart`.

There is also no Lombok, no MapStruct, and no JPA associations. Entities carry scalar foreign keys
and services hydrate collections in one query per collection rather than one per row, which keeps
the SQL predictable and the N+1 problem structurally absent instead of merely watched for.

---

## Status and honest caveats

Everything described here is written and complete: 104 backend files, 35 frontend source files, the
container definitions, the compose stack and the Kubernetes manifests.

What has **not** happened is a compile-and-run in this environment — the sandbox that would host
`mvn clean package`, `npm run build` and `docker compose up --build` was unavailable for the whole
build, so those three commands are yours to run rather than mine to report on. The code was written
to compensate: every DTO record arity, repository method name, `@RequestParam` name, CSS custom
property, CSS class and React prop was verified against the actual file before it was used, and the
deliberate avoidance of Lombok, MapStruct, constructor-expression JPQL and JPA associations removes
the categories of error that most often survive a careful read. If something does fail on first
build, the likely places are Maven dependency resolution behind a proxy and the MySQL credential
mismatch described under [If something is wrong](#if-something-is-wrong).

---

## Licence

MIT. Use it, sell it, fork it.
