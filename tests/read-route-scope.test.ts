import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const limitCharges: Array<number | undefined> = [];

vi.mock("@/lib/api/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/rate-limit")>(
    "../src/lib/api/rate-limit",
  );
  return {
    ...actual,
    rejectIfRateLimited: (_request: Request, _scope: string, units?: number) => {
      limitCharges.push(units);
      return Promise.resolve(null);
    },
  };
});

vi.mock("@/lib/metrics/queries", () => ({
  getStationDetail: () => Promise.reject(new Error("the database went away")),
  getStationStatuses: () => Promise.reject(new Error("the database went away")),
  getDailyHistory: () => Promise.reject(new Error("the database went away")),
}));

const TOKEN = "a-token-only-this-test-knows";
const WIDEST_WINDOW = "days=730";
const SLUG_A_CALLER_CHOSE = "whatever-a-caller-typed";

function authorized(url: string): Request {
  return new Request(url, { headers: { authorization: `Bearer ${TOKEN}` } });
}

describe("a read route names itself in its error log without quoting the caller", () => {
  const original = process.env.API_READ_TOKEN;

  beforeEach(() => {
    process.env.API_READ_TOKEN = TOKEN;
    limitCharges.length = 0;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.API_READ_TOKEN;
    else process.env.API_READ_TOKEN = original;
    vi.restoreAllMocks();
  });

  async function scopeLoggedBy(invoke: () => Promise<Response>): Promise<string> {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await invoke();
    expect(response.status).toBe(503);
    return logged.mock.calls.map((call) => String(call[0])).join(" ");
  }

  it("uses the collection path for a route without parameters", async () => {
    const scope = await scopeLoggedBy(async () =>
      (await import("@/app/api/stations/route")).GET(
        authorized("https://example.test/api/stations"),
      ),
    );

    expect(scope).toContain("GET /api/stations failed");
  });

  it("logs the pattern that matched, not the station the caller asked for", async () => {
    const scope = await scopeLoggedBy(async () =>
      (await import("@/app/api/stations/[slug]/route")).GET(
        authorized(`https://example.test/api/stations/${SLUG_A_CALLER_CHOSE}`),
        { params: Promise.resolve({ slug: SLUG_A_CALLER_CHOSE }) },
      ),
    );

    expect(scope).toContain("GET /api/stations/[slug] failed");
    expect(scope).not.toContain(SLUG_A_CALLER_CHOSE);
  });

  it("keeps a slug that arrived percent-encoded out of the log too", async () => {
    const spaced = "two words";
    const scope = await scopeLoggedBy(async () =>
      (await import("@/app/api/stations/[slug]/route")).GET(
        authorized(`https://example.test/api/stations/${encodeURIComponent(spaced)}`),
        { params: Promise.resolve({ slug: spaced }) },
      ),
    );

    expect(scope).toContain("GET /api/stations/[slug] failed");
    expect(scope).not.toContain("two%20words");
  });
});

describe("only the routes that widen a query pay for a wider window", () => {
  const original = process.env.API_READ_TOKEN;

  beforeEach(() => {
    process.env.API_READ_TOKEN = TOKEN;
    limitCharges.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (original === undefined) delete process.env.API_READ_TOKEN;
    else process.env.API_READ_TOKEN = original;
    vi.restoreAllMocks();
  });

  it("charges a window-scoped route more for a wider window", async () => {
    await (
      await import("@/app/api/metrics/history/route")
    ).GET(authorized(`https://example.test/api/metrics/history?${WIDEST_WINDOW}`));

    expect(limitCharges[0]).toBeGreaterThan(1);
  });

  it("ignores a window a route does not use, however wide the caller claims", async () => {
    await (
      await import("@/app/api/stations/route")
    ).GET(authorized(`https://example.test/api/stations?${WIDEST_WINDOW}`));

    expect(limitCharges[0]).toBe(1);
  });
});
