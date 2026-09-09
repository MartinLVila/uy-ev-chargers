import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepartmentBreakdown, StationReliability } from "../src/lib/metrics/queries";

const departmentBreakdown = vi.hoisted(() => vi.fn());
const stationReliability = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));

vi.mock("@/lib/metrics/queries", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/metrics/queries")>(
    "../src/lib/metrics/queries",
  );
  return {
    ...actual,
    getDepartmentBreakdown: departmentBreakdown,
    getStationReliability: stationReliability,
  };
});

function department(overrides: Partial<DepartmentBreakdown> = {}): DepartmentBreakdown {
  return {
    department: "Rocha",
    stations: 3,
    connectors: 6,
    operational: 6,
    faulted: 0,
    absent: 0,
    outOfService: 0,
    ...overrides,
  };
}

function reliability(overrides: Partial<StationReliability> = {}): StationReliability {
  return {
    slug: "una-estacion",
    name: "Una Estación",
    department: "Rocha",
    city: "Chuy",
    latitude: -33.7,
    longitude: -53.5,
    connectorSeconds: 100,
    unknownSeconds: 0,
    outOfServiceSeconds: 0,
    availability: 0.8,
    currentlyOutOfService: 0,
    ...overrides,
  };
}

async function render(params: { departamento?: string }): Promise<string> {
  const { default: TripPage } = await import("../src/app/viaje/page");
  const element = await TripPage({ searchParams: Promise.resolve(params) });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  departmentBreakdown.mockReset();
  stationReliability.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the trip screen never promises whether you make it", () => {
  it("shows a department picker with no destination chosen", async () => {
    departmentBreakdown.mockResolvedValue([department()]);

    const markup = await render({});

    expect(markup).toContain("¿A dónde vas?");
    expect(markup).toContain("Rocha");
  });

  it("never states a battery estimate, a distance or the design's own verdict wording", async () => {
    departmentBreakdown.mockResolvedValue([department()]);
    stationReliability.mockResolvedValue([reliability()]);

    const picker = await render({});
    const detail = await render({ departamento: "Rocha" });

    for (const markup of [picker, detail]) {
      expect(markup).not.toContain("Llegás");
      expect(markup).not.toContain("No sin parar");
      expect(markup.toLowerCase()).not.toContain("batería estimada");
      expect(markup.toLowerCase()).not.toContain(" km");
    }
  });

  it("says a chosen department was not found rather than crashing on a bad param", async () => {
    departmentBreakdown.mockResolvedValue([department()]);

    const markup = await render({ departamento: "No Existe" });

    expect(markup).toContain("No encontramos");
  });
});

describe("stations for a chosen department are ranked by real historical availability", () => {
  it("lists the more reliable station first", async () => {
    departmentBreakdown.mockResolvedValue([department()]);
    stationReliability.mockResolvedValue([
      reliability({ slug: "baja", name: "Estación Baja", availability: 0.3 }),
      reliability({ slug: "alta", name: "Estación Alta", availability: 0.95 }),
    ]);

    const markup = await render({ departamento: "Rocha" });
    const altaIndex = markup.indexOf("Estación Alta");
    const bajaIndex = markup.indexOf("Estación Baja");

    expect(altaIndex).toBeGreaterThan(-1);
    expect(bajaIndex).toBeGreaterThan(-1);
    expect(altaIndex).toBeLessThan(bajaIndex);
  });

  it("only shows stations belonging to the chosen department", async () => {
    departmentBreakdown.mockResolvedValue([department(), department({ department: "Salto" })]);
    stationReliability.mockResolvedValue([
      reliability({ slug: "en-rocha", name: "En Rocha", department: "Rocha" }),
      reliability({ slug: "en-salto", name: "En Salto", department: "Salto" }),
    ]);

    const markup = await render({ departamento: "Rocha" });

    expect(markup).toContain("En Rocha");
    expect(markup).not.toContain("En Salto");
  });

  it("says there is not enough history rather than showing an empty list silently", async () => {
    departmentBreakdown.mockResolvedValue([department()]);
    stationReliability.mockResolvedValue([]);

    const markup = await render({ departamento: "Rocha" });

    expect(markup).toContain("Todavía no hay suficiente historial");
  });

  it("degrades to the same message, not a crash, when the reliability read fails", async () => {
    departmentBreakdown.mockResolvedValue([department()]);
    stationReliability.mockRejectedValue(new Error("Failed query"));

    const markup = await render({ departamento: "Rocha" });

    expect(markup).toContain("Todavía no hay suficiente historial");
  });
});
