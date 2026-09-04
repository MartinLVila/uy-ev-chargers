import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DashboardData } from "../src/lib/metrics/dashboard";

const loadDashboard = vi.hoisted(() => vi.fn());

vi.mock("@/lib/metrics/dashboard", () => ({ loadDashboard }));
vi.mock("@/components/StationMapPanel", () => ({ StationMapPanel: () => null }));

const { default: DashboardPage } = await import("../src/app/page");

const OPERATOR_STRINGS = ["DATABASE_URL", "npm run", "db:migrate", "migraciones", "workflow"];

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await DashboardPage());
}

function expectNothingOperational(text: string, where: string): void {
  for (const operational of OPERATOR_STRINGS) {
    expect(text, `${where} names ${operational}`).not.toContain(operational);
  }
}

function emptyDashboard(): DashboardData {
  return {
    snapshot: {
      stations: { total: 0, listed: 0, silent: 0, delisted: 0 },
      connectors: {
        reported: 0,
        operational: 0,
        faulted: 0,
        unknown: 0,
        absent: 0,
        outOfService: 0,
      },
      lastSuccessfulPollAt: null,
    } as DashboardData["snapshot"],
    feed: {} as DashboardData["feed"],
    departments: [],
    stations: [],
    reliability: [],
    history: [],
    historyDays: 90,
    reliabilityDays: 30,
  };
}

describe("the dashboard's failure states say nothing only an operator could use", () => {
  it("tells a visitor the data could not be read, without naming a cause nobody observed", async () => {
    loadDashboard.mockResolvedValue(null);

    const markup = await renderPage();

    expect(markup).toContain("No pudimos leer los datos en este momento");
    expect(markup, "the catch covers every failure, so the page cannot name one").not.toContain(
      "no respondió",
    );
    expect(markup).not.toContain("<code>");
    expectNothingOperational(markup, "the failure page");
  });

  it("tells a visitor there are no readings yet, and nothing about how to take one", async () => {
    loadDashboard.mockResolvedValue(emptyDashboard());

    const markup = await renderPage();

    expect(markup).toContain("Todavía no se registró ninguna lectura");
    expect(markup).not.toContain("<code>");
    expectNothingOperational(markup, "the empty-database page");
  });
});

describe("nothing a visitor can reach carries operator instructions", () => {
  const root = fileURLToPath(new URL("../src", import.meta.url));
  const rendered = readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".tsx"))
    .map((entry) => entry.replace(/\\/g, "/"));

  it("finds every page and component the visitor can reach", () => {
    expect(rendered).toContain("app/page.tsx");
    expect(rendered).toContain("app/estaciones/[slug]/page.tsx");
    expect(rendered).toContain("app/layout.tsx");
    expect(rendered.filter((entry) => entry.startsWith("components/")).length).toBeGreaterThan(5);
  });

  for (const name of rendered) {
    it(`keeps ${name} free of them`, () => {
      expectNothingOperational(readFileSync(join(root, name), "utf8"), name);
    });
  }

  it("never names a failure mode the catch cannot tell apart", () => {
    for (const name of rendered) {
      expect(
        readFileSync(join(root, name), "utf8"),
        `${name} blames the database for a catch that also covers configuration and query errors`,
      ).not.toContain("no respondió");
    }
  });
});
