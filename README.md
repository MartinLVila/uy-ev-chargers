# uy-ev-chargers

Availability tracker for Uruguay's public EV charging network, built on the station feed
UTE publishes behind [movilidad.ute.com.uy](https://movilidad.ute.com.uy/mapa.html).

The official map shows the present moment and keeps no history. This project polls the same
feed every fifteen minutes, records each state change, and exposes the result as a map,
availability metrics, and a queryable history.

## Stack

Next.js 16 (App Router) · TypeScript · Drizzle ORM · Neon Postgres · Leaflet · Vitest with
PGlite. Requires Node.js 20.9 or later.

## Data source

```
GET https://movilidad.ute.com.uy/api/v1/station/status/map
```

Unauthenticated. As of August 2026 it returns 212 stations and 494 connectors across the 19
departments, with connectors pre-aggregated by type, power and cable attachment rather than
listed individually. A sibling endpoint, `/api/v1/station/status/list`, requires auth and
returns 401.

The feed needs cleaning before use: department names arrive with inconsistent casing,
accents and trailing whitespace (`Río negro`, `Colonia `), and there is no stable station
identifier of any kind.

### Known limitation: the status field is not usable

Every connector in the feed reports `Busy` and every station reports `Cargando`. Across
sampling, the endpoint returned a byte-identical payload each time. As long as that holds,
`statusDetail` carries no fault signal.

The design accounts for this rather than assuming the field works:

- Every poll stores a SHA-256 digest of the response body, so the API can report how long
  UTE has been republishing identical bytes (`identicalPayloadStreak`, `unchangedSince`).
  The dashboard shows a warning when that streak grows, because otherwise a dead feed reads
  as a perfectly healthy network.
- Availability is derived from several independent signals, not from `statusDetail` alone:
  stations leaving the feed, stations listed without any connector telemetry, connector
  groups losing capacity, and fault states if they begin to appear.

If upstream starts publishing real statuses, the same pipeline records them with no changes.

## How availability is measured

Connector state is stored as **validity intervals**, not one row per poll. A row is written
only when state actually changes, so the table grows with real-world churn rather than with
polling frequency. This is what makes long retention affordable: at 0.5 GB, a row-per-poll
schema fills up in about ten weeks, while interval storage holds years.

| Health | Meaning |
| --- | --- |
| `operational` | Reported in a state where a driver can charge |
| `faulted` | Reported as faulted, unavailable, offline or out of order |
| `absent` | Stopped appearing in the feed; carries the last known connector count |
| `unknown` | A label the classifier does not recognise |

`unknown` is never folded into `operational`. The feed is undocumented, so treating an
unrecognised label as healthy would quietly understate outages.

A single group can hold several concurrent states, because UTE splits a bank of otherwise
identical connectors into separate entries when they are not all in the same condition.

Station presence is tracked separately as `listed`, `silent` (present but never reported any
connector telemetry) or `delisted` (gone from the feed).

Per-station availability is weighted by connector count and outage duration, so a
six-connector site down for a day outranks a single-connector site down for a day.

It is measured over the time that could be classified: `unknown` seconds are excluded from
the denominator rather than counted as working, and are reported separately as
`unknownSeconds`. A station whose statuses were never recognised has no availability figure
at all rather than a perfect one, and sorts below stations with a real measurement.

Daily buckets follow `America/Montevideo`, passed explicitly to Postgres. Relying on the
session default would silently shift every bucket depending on where the query ran.

A failed poll is recorded but never mutates station or connector state. Upstream being
unreachable says nothing about whether a charger works, and closing intervals on that signal
would fabricate outages.

## API

The dashboard is public. The JSON API is not: every endpoint below requires
`Authorization: Bearer $API_READ_TOKEN`. The pages do not go through it — they query the database
directly as server components — so closing the API changes nothing about what a visitor sees.

If `API_READ_TOKEN` is unset the API answers `503` rather than serving openly. A missing
configuration closes it; it cannot silently reopen.

| Endpoint | Description |
| --- | --- |
| `GET /api/stations` | All stations with current health tallies |
| `GET /api/stations/{slug}?days=30` | One station and its state timeline |
| `GET /api/metrics/overview?days=30` | Network snapshot, feed health, department and connector breakdowns |
| `GET /api/metrics/history?days=90` | Daily series of tracked and out-of-service connectors |
| `GET /api/metrics/reliability?days=30&limit=50` | Per-station availability ranking |
| `GET /api/health` | Database reachability and data freshness |
| `POST /api/poll` | Triggers one ingestion run; requires `Authorization: Bearer $CRON_SECRET` |

## Published data

A daily workflow writes the collected history into `data/` and commits it:

- `network-history.csv` — one row per local day
- `stations.json` — every station with its current health tally

The database is the working store; these files are the public record, auditable without
database access. See [`data/README.md`](data/README.md) for the column definitions.

## Layout

```
src/lib/ute/        Feed client, payload validation, normalisation, health classification
src/lib/ingest/     Poll, diff against stored state, write intervals
src/lib/metrics/    Interval arithmetic and aggregate queries
src/lib/db/         Drizzle schema and connection handles
src/app/            Dashboard, station pages, JSON API
scripts/            Migration, polling and snapshot entry points
tests/              Ingestion, metrics and feed-client suites
```

## Local development

```bash
npm install
cp .env.example .env        # set DATABASE_URL
npm run db:migrate
npm run poll                # one ingestion pass
npm run dev
```

Tests run against an in-process Postgres (PGlite) with the production migrations applied, so
they need no database and no network:

```bash
npm test
npm run typecheck
npm run lint
```

## Deployment

The web app runs on Vercel. Ingestion is triggered over HTTP:

```
POST /api/poll
Authorization: Bearer $CRON_SECRET
```

The endpoint fetches the UTE feed, runs the same ingestion pipeline the CLI uses, and returns
the resulting `poll_run`. It answers `401` without the secret and `503` if `CRON_SECRET` is unset.

Only one ingestion runs at a time. The lock lives in the database rather than in the process,
because the fallback workflow ingests directly without going through the endpoint, and it
expires after five minutes so a run that is killed mid-flight does not block the next one. A
request arriving while another poll is in progress answers `409`; one arriving within a minute
of a successful poll answers `429`. A failed poll does not arm that window, so a scheduler can
retry a transient upstream failure immediately.

`GET` is accepted with the same header because Vercel Cron issues `GET` and sends
`Authorization: Bearer $CRON_SECRET` itself.

Needs `DATABASE_URL` and `CRON_SECRET` as Vercel environment variables. `DATABASE_URL` is also
a GitHub repository secret for the fallback workflow below.

### Scheduling

Any scheduler that can send a header works: Vercel Cron on a Pro plan, or an external service
such as cron-job.org, Upstash QStash or EasyCron.

**Vercel Cron requires the Pro plan for this.** Hobby is limited to one run per day, and a more
frequent expression fails at deploy time rather than degrading.

`.github/workflows/poll.yml` remains as a fallback, calling `npm run poll` directly against the
database rather than through the endpoint. It is scheduled hourly.

**GitHub does not honour frequent schedules.** Scheduled workflows are best effort and runs are
dropped under load rather than queued. At `*/15` this repository saw 32, 20, 3, 2 and 1 polls on
five consecutive days, with gaps of up to twelve hours. The hourly schedule is a floor, not a
guarantee, which is why the primary trigger is an external scheduler hitting the endpoint.

### Rate limiting

The read API is public and stays public, but it is not unmetered. Every route is limited per
client address through Upstash Redis: 60 requests a minute for the read API, 20 an hour for
`/api/poll`. A rejected request answers `429` with `Retry-After` and reveals nothing about which
limit it hit.

Requests that ask for a wider window cost more than one unit against that budget, one per 90 days
requested. A 30-day dashboard load costs one; a two-year scan costs nine. This is what stops an
unauthenticated caller from varying `?days=` to slip past the edge cache and run the heaviest
aggregate repeatedly.

`/api/poll` additionally checks Upstash's aggregated abuse list, which the read API does not: the
poll endpoint is the only write path and carries almost no traffic, so the extra Redis commands buy
more there than they cost.

**The limiter fails open.** If Redis is unreachable or the credentials are missing, requests are
allowed through and the failure is logged. A rate limiter that takes the API down when its own
backing store is unavailable would be a worse outage than the one it prevents. The trade is
deliberate: availability of a public read-only API beats strict enforcement, and the edge cache
still absorbs repeat traffic underneath it.

Responses carry `CDN-Cache-Control` and `Vercel-CDN-Cache-Control` alongside `Cache-Control`,
because the edge directives were being dropped from the combined header and every request was
reaching a function. Errors and `429`s are `no-store` on all three.

### Polling interval and the Neon free tier

Neon's free tier allows 100 CU-hours per month and scales compute to zero after five minutes
of inactivity, so polling frequency is bounded by compute rather than by storage:

| Interval | CU-hours/month | Within free tier |
| --- | --- | --- |
| 5 min | ~182 | No |
| 10 min | ~92 | Marginal |
| 15 min | ~61 | Yes |

Fifteen minutes gives 96 observations per connector per day. Interval storage only writes on an
observed change, so the sampling rate sets how fine-grained the history can be: a fault that
starts and clears between two polls is never recorded at all.

### Keeping the schedule alive

GitHub disables scheduled workflows in public repositories after 60 days without repository
activity, and only commits reset that timer — tags, issues and merged pull requests do not.
The snapshot job appends a row to the CSV every day, so it always has something to commit.

## License

MIT — see [LICENSE](LICENSE).

Not affiliated with UTE. Station data belongs to its publisher.
