import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = ["KV_REST_API_URL", "KV_REST_API_TOKEN"] as const;

const original: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

async function freshRateLimiter() {
  vi.resetModules();
  return import("../src/lib/api/rate-limit");
}

function aRead(): Request {
  return new Request("https://example.test/api/stations", { headers: { "x-real-ip": "203.0.113.9" } });
}

describe("a rate limiter with nowhere to store counts", () => {
  beforeEach(() => {
    for (const key of KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    vi.restoreAllMocks();
  });

  it("says so once, not once per request", async () => {
    const complained = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rejectIfRateLimited } = await freshRateLimiter();

    for (let request = 0; request < 5; request += 1) {
      await rejectIfRateLimited(aRead(), "read");
    }

    expect(complained).toHaveBeenCalledTimes(1);
    expect(String(complained.mock.calls[0][0])).toContain("Rate limiting is disabled");
  });

  it("lets every request through rather than refusing what it cannot meter", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rejectIfRateLimited } = await freshRateLimiter();

    expect(await rejectIfRateLimited(aRead(), "read")).toBeNull();
    expect(await rejectIfRateLimited(aRead(), "poll")).toBeNull();
  });
});
