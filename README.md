# uy-ev-chargers

A public record of how Uruguay's electric vehicle charging network actually behaves over time.

Charging maps tend to answer one question: what is free right now. That is the question you need
when the battery is low, and it is the only question they answer. They cannot tell you whether the
charger you are driving towards has worked reliably this month, whether a station has been out of
service for weeks, or whether the network as a whole is getting better or worse.

This project watches the network continuously and keeps what it sees. Every change in a charger's
state is recorded and never overwritten, so the past stays answerable.

## What you can see

- A map of every charging station and how each one is doing right now
- Per-station history: how often a charger has been available, in use, or out of service
- How reliability differs between departments and between connector types
- How the network has changed over months rather than minutes

The collected history is also published as plain data files in this repository, so the figures can
be checked and reused by anyone.

## Independence

**This is an independent project. It is not affiliated with, endorsed by, or operated by UTE or any
charging network operator.**

Everything here is observation from the outside. The numbers describe what this project was able to
see, which is not the same as what actually happened: an outage during a gap in observation leaves
no trace, and a charger can be listed as working while being unusable in practice. Treat the figures
as a well-kept record of one observer, not as an official source.

Station data belongs to its publisher.

## License

MIT — see [LICENSE](LICENSE).
