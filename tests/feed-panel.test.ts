import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DashboardData } from "../src/lib/metrics/dashboard";
import type { DailyPoint } from "../src/lib/metrics/queries";

const loadDashboard = vi.hoisted(() => vi.fn());

vi.mock("@/lib/metrics/dashboard", () => ({ loadDashboard }));
vi.mock("@/components/StationMapPanel", () => ({ StationMapPanel: () => null }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ execute: async () => ({ rows: [] }) }) }));

const { default: DashboardPage } = await import("../src/app/page");

function readable(markup: string): string {
  return markup.replaceAll("<!-- -->", "");
}

function history(): DailyPoint[] {
  return [
    {
      day: "2026-09-04",
      connectorsTracked: 500,
      connectorsAbsent: 10,
      connectorsOutOfService: 40,
      outOfServiceRatio: 0.07,
      stationsDelisted: 0,
    },
  ];
}

function dashboard(
  feed: Partial<DashboardData["feed"]>,
  stations: DashboardData["stations"] = [],
): DashboardData {
  return {
    snapshot: {
      stations: { total: 251, listed: 251, silent: 0, delisted: 0 },
      connectors: {
        reported: 594,
        operational: 554,
        faulted: 27,
        unknown: 0,
        absent: 15,
        outOfService: 42,
      },
      lastSuccessfulPollAt: "2026-09-04T19:00:00.000Z",
    } as DashboardData["snapshot"],
    feed: {
      windowDays: 90,
      polls: 100,
      successes: 100,
      failures: 0,
      successRate: 1,
      distinctPayloads: 90,
      identicalPayloadStreak: 0,
      lastFailureAt: null,
      unchangedSince: null,
      ...feed,
    } as DashboardData["feed"],
    departments: [],
    stations,
    reliability: [],
    history: history(),
    historyDays: 90,
    reliabilityDays: 30,
  };
}

async function render(feed: Partial<DashboardData["feed"]>): Promise<string> {
  loadDashboard.mockResolvedValue(dashboard(feed));
  return readable(renderToStaticMarkup(await DashboardPage()));
}

function feedGridOf(markup: string): string {
  const start = markup.indexOf('<dl class="feed-grid"');
  return markup.slice(start, markup.indexOf("</dl>", start));
}

describe("the feed panel stays a description list under its new grid", () => {
  it("keeps every label paired with its value for a screen reader", async () => {
    const markup = await render({});

    expect(markup).toContain("<dl class=\"feed-grid\"");
    expect(markup).toContain("<dt");
    expect(markup).toContain("<dd");
  });

  it("says 'ninguna' rather than nothing when there has been no failure", async () => {
    const markup = await render({ lastFailureAt: null });

    expect(markup).toContain("ninguna");
  });

  it("still names the timestamp when a failure happened", async () => {
    const markup = await render({ lastFailureAt: "2026-09-01T10:00:00.000Z" });

    expect(markup).not.toContain(">ninguna<");
  });
});

describe("a failing feed does not end up the least prominent cell in the grid", () => {
  it("colours the failure count once there has been at least one", async () => {
    const markup = await render({ failures: 3 });

    expect(feedGridOf(markup)).toContain("color:var(--status-warning)");
  });

  it("leaves the grid unstyled when nothing is wrong", async () => {
    const healthy = await render({ failures: 0, identicalPayloadStreak: 0 });

    expect(feedGridOf(healthy)).not.toContain("color:var(--status-warning)");
  });

  it("colours the identical-payload streak once it reaches the banner's own threshold", async () => {
    const markup = await render({ identicalPayloadStreak: 3, unchangedSince: "2026-09-01T00:00:00Z" });

    expect(feedGridOf(markup)).toContain("color:var(--status-warning)");
  });
});

describe("the stale-feed banner announces itself", () => {
  it("carries role=alert once UTE has republished the same payload three times", async () => {
    const markup = await render({
      identicalPayloadStreak: 3,
      unchangedSince: "2026-09-01T00:00:00Z",
    });

    expect(markup).toContain('role="alert"');
  });

  it("says nothing, and renders no alert, below the republish threshold", async () => {
    const markup = await render({ identicalPayloadStreak: 2, unchangedSince: "2026-09-01T00:00:00Z" });

    expect(markup).not.toContain('role="alert"');
  });

  it("keeps the warning glyph decorative, with the words carrying the meaning", async () => {
    const markup = await render({
      identicalPayloadStreak: 3,
      unchangedSince: "2026-09-01T00:00:00Z",
    });

    expect(markup).toMatch(/aria-hidden="true"[^>]*>⚠/);
    expect(markup).toContain("UTE viene publicando exactamente los mismos datos");
  });
});
