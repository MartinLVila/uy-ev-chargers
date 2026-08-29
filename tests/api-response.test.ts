import { afterEach, describe, expect, it, vi } from "vitest";
import { loggedErrorResponse } from "../src/lib/api/response";

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
