import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { StationDetail, StationReliability, StationStatus } from "../src/lib/metrics/queries";

const stationStatuses = vi.hoisted(() => vi.fn());
const stationDetail = vi.hoisted(() => vi.fn());
const hourlyUsage = vi.hoisted(() => vi.fn());
const reliability = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));

vi.mock("@/lib/metrics/queries", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/metrics/queries")>(
    "../src/lib/metrics/queries",
  );
  return {
    ...actual,
    getStationStatuses: stationStatuses,
    getStationDetail: stationDetail,
    getStationHourlyUsage: hourlyUsage,
    getStationReliability: reliability,
  };
});

function station(overrides: Partial<StationStatus> = {}): StationStatus {
  return {
    slug: "estacion-a",
    name: "Estación A",
    address: "Calle 1",
    city: "Trinidad",
    department: "Flores",
    latitude: -33.5,
    longitude: -56.9,
    presence: "listed",
    connectors: 2,
    operational: 2,
    faulted: 0,
    unknown: 0,
    absent: 0,
    outOfService: 0,
    lastSeenAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

function detail(overrides: Partial<StationDetail> = {}): StationDetail {
  return {
    slug: "estacion-a",
    name: "Estación A",
    address: "Calle 1",
    city: "Trinidad",
    department: "Flores",
    latitude: -33.5,
    longitude: -56.9,
    firstSeenAt: "2026-08-01T00:00:00.000Z",
    lastSeenAt: "2026-09-08T00:00:00.000Z",
    presence: "listed",
    timeline: [
      {
        connectorType: "CCS2",
        powerKw: 50,
        hasCable: true,
        connectorCount: 2,
        health: "operational",
        statusDetail: "available",
        startedAt: "2026-09-01T00:00:00.000Z",
        endedAt: null,
      },
    ],
    timelineTruncated: false,
    timelineCoversFrom: null,
    ...overrides,
  };
}

async function render(params: {
  localidad?: string;
  departamento?: string;
  estacion?: string;
}): Promise<string> {
  const { default: NearMePage } = await import("../src/app/cerca/page");
  const element = await NearMePage({ searchParams: Promise.resolve(params) });
  return renderToStaticMarkup(element);
}

async function redirectTarget(params: {
  localidad?: string;
  departamento?: string;
  estacion?: string;
}): Promise<string> {
  try {
    await render(params);
  } catch (error) {
    const [marker, , target] = ((error as { digest?: string }).digest ?? "").split(";");
    if (marker === "NEXT_REDIRECT") return target;
    throw error;
  }

  throw new Error("the page rendered a picker instead of redirecting");
}

beforeEach(() => {
  stationStatuses.mockReset();
  stationDetail.mockReset();
  hourlyUsage.mockReset();
  reliability.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the near-me screen without a location falls back to a locality picker", () => {
  it("lists localities rather than asking for geolocation", async () => {
    stationStatuses.mockResolvedValue([station()]);

    const markup = await render({});

    expect(markup).toContain("¿Dónde estás?");
    expect(markup).toContain("Trinidad");
    expect(markup).not.toContain("geolocation");
  });

  it("offers real geolocation instead of a false claim that location is already used", async () => {
    stationStatuses.mockResolvedValue([station()]);

    const markup = await render({});

    expect(markup).toContain("Usar mi ubicación");
    expect(markup).not.toContain("Esto se calcula en tu navegador");
  });

  it("says a locality was not found rather than crashing on a bad param", async () => {
    stationStatuses.mockResolvedValue([station()]);

    const markup = await render({ localidad: "Una Ciudad Que No Existe" });

    expect(markup).toContain("No encontramos");
  });
});

describe("a locality name that exists in more than one department is never ambiguous", () => {
  it("resolves to the right department's station when both are given", async () => {
    stationStatuses.mockResolvedValue([
      station({ slug: "la-paloma-rocha", city: "La Paloma", department: "Rocha" }),
      station({ slug: "la-paloma-durazno", city: "La Paloma", department: "Durazno" }),
    ]);

    await expect(redirectTarget({ localidad: "La Paloma", departamento: "Rocha" })).resolves.toBe(
      "/cerca?localidad=La+Paloma&departamento=Rocha&estacion=la-paloma-rocha",
    );
    await expect(redirectTarget({ localidad: "La Paloma", departamento: "Durazno" })).resolves.toBe(
      "/cerca?localidad=La+Paloma&departamento=Durazno&estacion=la-paloma-durazno",
    );
  });

  it("links to both the name and the department, not the name alone", async () => {
    stationStatuses.mockResolvedValue([
      station({ slug: "la-paloma-rocha", city: "La Paloma", department: "Rocha" }),
      station({ slug: "la-paloma-durazno", city: "La Paloma", department: "Durazno" }),
    ]);

    const markup = await render({});

    expect(markup).toContain("departamento=Rocha");
    expect(markup).toContain("departamento=Durazno");
  });
});

describe("a locality with more than one station asks which one before showing a claim", () => {
  it("lists both stations instead of guessing", async () => {
    stationStatuses.mockResolvedValue([
      station({ slug: "a", name: "Estación A" }),
      station({ slug: "b", name: "Estación B" }),
    ]);

    const markup = await render({ localidad: "Trinidad" });

    expect(markup).toContain("Estación A");
    expect(markup).toContain("Estación B");
    expect(markup).not.toContain("Ahora hay lugar");
  });
});

describe("a locality with exactly one station skips the extra tap", () => {
  it("redirects straight to that station", async () => {
    stationStatuses.mockResolvedValue([station()]);

    await expect(render({ localidad: "Trinidad" })).rejects.toThrow(/NEXT_REDIRECT/);
  });
});

describe("the station card never claims room the feed did not confirm", () => {
  beforeEach(() => {
    hourlyUsage.mockResolvedValue([]);
    reliability.mockResolvedValue([]);
  });

  it("says there is room when a connector is actually free right now", async () => {
    stationStatuses.mockResolvedValue([station()]);
    stationDetail.mockResolvedValue(detail());

    const markup = await render({ localidad: "Trinidad", estacion: "estacion-a" });

    expect(markup).toContain("Ahora hay lugar.");
  });

  it("refuses the claim once the station has gone silent", async () => {
    stationStatuses.mockResolvedValue([station({ presence: "silent" })]);
    stationDetail.mockResolvedValue(detail({ presence: "silent" }));

    const markup = await render({ localidad: "Trinidad", estacion: "estacion-a" });

    expect(markup).toContain("No sabemos si hay lugar ahora");
  });
});

describe("alternatives are ranked by real historical availability, not left to chance", () => {
  it("lists the more reliable alternative first", async () => {
    stationStatuses.mockResolvedValue([
      station({ slug: "a", name: "Estación A" }),
      station({ slug: "b", name: "Estación B" }),
      station({ slug: "c", name: "Estación C" }),
    ]);
    stationDetail.mockResolvedValue(detail({ slug: "a" }));
    hourlyUsage.mockResolvedValue([]);
    reliability.mockResolvedValue([
      { slug: "b", name: "Estación B", availability: 0.4 } as StationReliability,
      { slug: "c", name: "Estación C", availability: 0.9 } as StationReliability,
    ]);

    const markup = await render({ localidad: "Trinidad", estacion: "a" });
    const cIndex = markup.indexOf("Estación C");
    const bIndex = markup.indexOf("Estación B");

    expect(cIndex).toBeGreaterThan(-1);
    expect(bIndex).toBeGreaterThan(-1);
    expect(cIndex).toBeLessThan(bIndex);
  });

  it("still lists an alternative that has no reliability row, rather than dropping it", async () => {
    stationStatuses.mockResolvedValue([
      station({ slug: "a", name: "Estación A" }),
      station({ slug: "b", name: "Estación B" }),
    ]);
    stationDetail.mockResolvedValue(detail({ slug: "a" }));
    hourlyUsage.mockResolvedValue([]);
    reliability.mockResolvedValue([]);

    const markup = await render({ localidad: "Trinidad", estacion: "a" });

    expect(markup).toContain("Estación B");
    expect(markup).toContain("sin clasificar");
  });
});

describe("the pip strip never lets a large healthy count crowd out a small fault count", () => {
  it("keeps a broken pip visible even when truncating a station with many free connectors", async () => {
    stationStatuses.mockResolvedValue([station()]);
    stationDetail.mockResolvedValue(
      detail({
        timeline: [
          ...Array.from({ length: 30 }, () => ({
            connectorType: "CCS2",
            powerKw: 50,
            hasCable: true,
            connectorCount: 1,
            health: "operational",
            statusDetail: "available",
            startedAt: "2026-09-01T00:00:00.000Z",
            endedAt: null,
          })),
          {
            connectorType: "CCS2",
            powerKw: 50,
            hasCable: true,
            connectorCount: 1,
            health: "faulted",
            statusDetail: "unavailable",
            startedAt: "2026-09-01T00:00:00.000Z",
            endedAt: null,
          },
        ],
      }),
    );
    hourlyUsage.mockResolvedValue([]);
    reliability.mockResolvedValue([]);

    const markup = await render({ localidad: "Trinidad", estacion: "estacion-a" });

    expect(markup).toContain("var(--status-critical)");
  });
});
