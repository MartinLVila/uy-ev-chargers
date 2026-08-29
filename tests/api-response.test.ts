import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, loggedErrorResponse } from "../src/lib/api/response";

describe("loggedErrorResponse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records the failure server side", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("connection to ep-secret-host.neon.tech refused");

    loggedErrorResponse("GET /api/stations", cause, "Unable to read station data");

    expect(logged).toHaveBeenCalledWith("GET /api/stations failed", cause);
  });

  it("keeps the underlying error out of the response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("connection to ep-secret-host.neon.tech refused");

    const response = loggedErrorResponse("GET /api/stations", cause, "Unable to read station data");
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "Unable to read station data" });
    expect(JSON.stringify(body)).not.toContain("neon.tech");
  });

  it("does not let an error response be cached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = loggedErrorResponse("GET /api/health", new Error("down"), "Database unavailable");

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("jsonResponse", () => {
  it("lets the edge absorb repeat traffic instead of the database", () => {
    const response = jsonResponse({ ok: true });

    expect(response.headers.get("cdn-cache-control")).toContain("s-maxage=60");
    expect(response.headers.get("vercel-cdn-cache-control")).toContain("s-maxage=60");
  });

  it("makes browsers revalidate rather than guess a freshness lifetime", () => {
    const response = jsonResponse({ ok: true });

    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
  });
});

describe("errorResponse caching", () => {
  it("keeps a failure out of the edge cache, not just the browser", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = loggedErrorResponse("GET /api/health", new Error("down"), "Database unavailable");

    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  });
});
