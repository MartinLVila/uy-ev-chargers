# Published data

Plain-text mirror of the collected history, refreshed once a day. The database is
the working store; these files are the public record, so the series can be
audited and cited without database access.

## `network-history.csv`

One row per day, in `America/Montevideo` local days.

| Column | Meaning |
| --- | --- |
| `day` | Local calendar day |
| `connectors_tracked` | Average connectors listed in the feed, faulted ones included |
| `connectors_absent` | Average connectors that had dropped out of the feed |
| `connectors_out_of_service` | Average faulted plus absent connectors |
| `out_of_service_ratio` | Out-of-service share of the total known fleet |
| `stations_delisted` | Average stations absent from the feed |

Averages are weighted by the share of the day each state was in effect, so a
change landing at 18:00 counts for a quarter of that day.

## `stations.json`

Every known station with its current health tally. Deliberately excludes the
last-seen timestamp: it changes on every poll and would rewrite the whole file
daily, hiding the changes that matter.
