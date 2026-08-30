import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const limitCalls: Array<{ scope: string; units: number | undefined }> = [];
let limitVerdict: Response | null = null;

vi.mock("@/lib/api/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/rate-limit")>(
    "../src/lib/api/rate-limit",
  );
  return {
    ...actual,
    rejectIfRateLimited: (_request: Request, scope: string, units?: number) => {
      limitCalls.push({ scope, units });
      return Promise.resolve(limitVerdict);
    },
  };
});

const ROUTES: Array<{ name: string; call: () => Promise<Response> }> = [
  {
    name: "GET /api/health",
    call: async () =>
      (await import("@/app/api/health/route")).GET(new Request("https://example.test/api/health")),
  },
  {
    name: "GET /api/stations",
    call: async () =>
      (await import("@/app/api/stations/route")).GET(
        new Request("https://example.test/api/stations"),
      ),
  },
  {
    name: "GET /api/stations/[slug]",
    call: async () =>
      (await import("@/app/api/stations/[slug]/route")).GET(
        new Request("https://example.test/api/stations/x?days=730"),
        { params: Promise.resolve({ slug: "x" }) },
      ),
  },
  {
    name: "GET /api/metrics/history",
    call: async () =>
      (await import("@/app/api/metrics/history/route")).GET(
        new Request("https://example.test/api/metrics/history?days=730"),
      ),
  },
  {
    name: "GET /api/metrics/overview",
    call: async () =>
      (await import("@/app/api/metrics/overview/route")).GET(
        new Request("https://example.test/api/metrics/overview?days=730"),
      ),
  },
  {
    name: "GET /api/metrics/reliability",
    call: async () =>
      (await import("@/app/api/metrics/reliability/route")).GET(
        new Request("https://example.test/api/metrics/reliability?days=730"),
      ),
  },
  {
    name: "GET /api/metrics/usage",
    call: async () =>
      (await import("@/app/api/metrics/usage/route")).GET(
        new Request("https://example.test/api/metrics/usage?days=730"),
      ),
  },
];

describe("read routes meter a request before they authorize it", () => {
  const original = process.env.API_READ_TOKEN;

  beforeEach(() => {
    process.env.API_READ_TOKEN = "a-token-no-caller-here-knows";
    limitCalls.length = 0;
    limitVerdict = null;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (original === undefined) delete process.env.API_READ_TOKEN;
    else process.env.API_READ_TOKEN = original;
    vi.restoreAllMocks();
  });

  for (const route of ROUTES) {
    it(`${route.name} charges an unauthenticated caller against the limiter`, async () => {
      const response = await route.call();

      expect(response.status).toBe(401);
      expect(limitCalls).toHaveLength(1);
      expect(limitCalls[0].scope).toBe("read");
    });

    it(`${route.name} answers 429 rather than 401 once the caller is over the limit`, async () => {
      limitVerdict = new Response(null, { status: 429 });

      const response = await route.call();

      expect(response.status).toBe(429);
    });
  }

  it("weights a wide window more heavily than a narrow one, before authorizing", async () => {
    await (
      await import("@/app/api/metrics/history/route")
    ).GET(new Request("https://example.test/api/metrics/history?days=730"));
    const wide = limitCalls[0].units;

    limitCalls.length = 0;
    await (
      await import("@/app/api/metrics/history/route")
    ).GET(new Request("https://example.test/api/metrics/history?days=1"));
    const narrow = limitCalls[0].units;

    expect(wide).toBeGreaterThan(narrow!);
  });

  it("says why a read was rejected without ever writing the token that was sent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await (
      await import("@/app/api/stations/route")
    ).GET(
      new Request("https://example.test/api/stations", {
        headers: { authorization: "Bearer a-guess-that-should-never-be-logged" },
      }),
    );

    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("Rejected an unauthorized read");
    expect(logged).not.toContain("a-guess-that-should-never-be-logged");
    expect(logged).not.toContain("a-token-no-caller-here-knows");
  });

  it("stays quiet for a caller that presented nothing, so only guesses leave a trace", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await (await import("@/app/api/stations/route")).GET(
      new Request("https://example.test/api/stations"),
    );

    expect(warn).not.toHaveBeenCalled();
  });

  it("tells an empty bearer token apart from the wrong scheme", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    for (const authorization of ["Bearer ", "Basic dXNlcjpwYXNz"]) {
      await (await import("@/app/api/stations/route")).GET(
        new Request("https://example.test/api/stations", { headers: { authorization } }),
      );
    }

    const [empty, wrongScheme] = warn.mock.calls.map((call) => String(call[0]));
    expect(empty).toContain("no value");
    expect(wrongScheme).toContain("not a bearer token");
  });
});
