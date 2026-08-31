import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { READ_ROUTES } from "./helpers/read-routes";

const TOKEN = "a-token-only-the-caller-and-the-server-know";

const A_STATION = {
  slug: "x",
  name: "Somewhere",
  address: null,
  city: null,
  department: "Montevideo",
  latitude: -34.9,
  longitude: -56.1,
  first_seen_at: "2026-01-01T00:00:00.000Z",
  last_seen_at: "2026-01-02T00:00:00.000Z",
  presence: "listed",
  rank_in_group: 1,
};

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({ execute: () => Promise.resolve({ rows: [A_STATION] }) }),
}));

function authorized(url: string): Request {
  return new Request(url, { headers: { authorization: `Bearer ${TOKEN}` } });
}

describe("token-gated routes never offer themselves to a shared cache", () => {
  const originalRead = process.env.API_READ_TOKEN;
  const originalCron = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.API_READ_TOKEN = TOKEN;
    process.env.CRON_SECRET = TOKEN;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalRead === undefined) delete process.env.API_READ_TOKEN;
    else process.env.API_READ_TOKEN = originalRead;
    if (originalCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCron;
    vi.restoreAllMocks();
  });

  for (const route of READ_ROUTES) {
    it(`${route.name} answers an authorized caller without a public cache directive`, async () => {
      const response = await route.invoke(authorized(route.url));

      expect(response.status).toBe(200);
      for (const header of ["cache-control", "cdn-cache-control", "vercel-cdn-cache-control"]) {
        expect(response.headers.get(header)).not.toContain("public");
        expect(response.headers.get(header)).not.toContain("s-maxage");
      }
    });

    it(`${route.name} tells caches the credential decides the body`, async () => {
      const response = await route.invoke(authorized(route.url));

      expect(response.headers.get("vary")).toBe("authorization");
    });

    it(`${route.name} does not open credentialed data to every origin`, async () => {
      const response = await route.invoke(authorized(route.url));

      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });

    it(`${route.name} keeps a rejection out of a shared cache too`, async () => {
      const response = await route.invoke(new Request(route.url));

      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });
  }

  it("the poll route refuses a bad credential on the same terms", async () => {
    const { GET } = await import("@/app/api/poll/route");

    const response = await GET(new Request("https://example.test/api/poll"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
