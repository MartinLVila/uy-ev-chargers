import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loggedErrorResponse,
  rateLimitedResponse,
  tokenGatedJsonResponse,
} from "../src/lib/api/response";

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

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("tokenGatedJsonResponse", () => {
  it("never invites a shared cache to store a payload a token paid for", () => {
    const response = tokenGatedJsonResponse({ ok: true });

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  });

  it("says the credential is what decides the body", () => {
    expect(tokenGatedJsonResponse({ ok: true }).headers.get("vary")).toBe("authorization");
  });

  it("does not hand credentialed data a wildcard origin", () => {
    expect(tokenGatedJsonResponse({ ok: true }).headers.get("access-control-allow-origin")).toBeNull();
  });

  it("keeps the caller's own status and headers", () => {
    const response = tokenGatedJsonResponse({ error: "nope" }, { status: 409 });

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("errorResponse caching", () => {
  it("keeps a failure out of the edge cache, not just the browser", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = loggedErrorResponse("GET /api/health", new Error("down"), "Database unavailable");

    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  });

  it("does not hand a rejection a wildcard origin either", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const rejected = loggedErrorResponse("GET /api/health", new Error("down"), "Unavailable");
    const throttled = rateLimitedResponse(30);

    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
    expect(throttled.headers.get("access-control-allow-origin")).toBeNull();
    expect(throttled.headers.get("retry-after")).toBe("30");
    expect(throttled.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("tokenGatedJsonResponse cannot be talked out of it", () => {
  it("wins over a caller that asks for a shared cache", () => {
    const response = tokenGatedJsonResponse(
      { ok: true },
      { headers: { "cache-control": "public, s-maxage=300" } },
    );

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps the caller's unrelated headers", () => {
    const response = tokenGatedJsonResponse(
      { ok: true },
      { headers: new Headers({ "retry-after": "12" }) },
    );

    expect(response.headers.get("retry-after")).toBe("12");
    expect(response.headers.get("vary")).toBe("authorization");
  });
});
