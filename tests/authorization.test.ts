import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeCronRequest, authorizeReadRequest, rejectUnauthorizedRead } from "../src/lib/api/authorization";

const SECRET = "s3cret-value-with-length";

function requestWith(authorization?: string): Request {
  return new Request("https://example.test/api/poll", {
    method: "POST",
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("authorizeCronRequest", () => {
  const original = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("accepts the configured secret", () => {
    expect(authorizeCronRequest(requestWith(`Bearer ${SECRET}`))).toBe("authorized");
  });

  it("accepts the scheme case-insensitively", () => {
    expect(authorizeCronRequest(requestWith(`bearer ${SECRET}`))).toBe("authorized");
  });

  it("rejects a request with no authorization header", () => {
    expect(authorizeCronRequest(requestWith())).toBe("unauthorized");
  });

  it("rejects an empty bearer token", () => {
    expect(authorizeCronRequest(requestWith("Bearer "))).toBe("unauthorized");
  });

  it("rejects another scheme carrying the right value", () => {
    expect(authorizeCronRequest(requestWith(`Basic ${SECRET}`))).toBe("unauthorized");
  });

  it("rejects a wrong secret of the same length", () => {
    const sameLength = "x".repeat(SECRET.length);
    expect(authorizeCronRequest(requestWith(`Bearer ${sameLength}`))).toBe("unauthorized");
  });

  it("rejects a prefix of the secret", () => {
    expect(authorizeCronRequest(requestWith(`Bearer ${SECRET.slice(0, -1)}`))).toBe("unauthorized");
  });

  it("refuses to authorize anything when no secret is configured", () => {
    delete process.env.CRON_SECRET;
    expect(authorizeCronRequest(requestWith(`Bearer ${SECRET}`))).toBe("not-configured");
    expect(authorizeCronRequest(requestWith())).toBe("not-configured");
  });

  it("refuses to authorize when the secret is set to an empty string", () => {
    process.env.CRON_SECRET = "";
    expect(authorizeCronRequest(requestWith("Bearer "))).toBe("not-configured");
  });
});

const READ_TOKEN = "read-token-with-enough-length";

function readRequest(authorization?: string): Request {
  return new Request("https://example.test/api/stations", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("authorizeReadRequest", () => {
  const original = process.env.API_READ_TOKEN;

  beforeEach(() => {
    process.env.API_READ_TOKEN = READ_TOKEN;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.API_READ_TOKEN;
    else process.env.API_READ_TOKEN = original;
  });

  it("accepts the configured token", () => {
    expect(authorizeReadRequest(readRequest(`Bearer ${READ_TOKEN}`))).toBe("authorized");
  });

  it("rejects a token of the same length that differs", () => {
    const sameLength = READ_TOKEN.slice(0, -1) + "X";
    expect(authorizeReadRequest(readRequest(`Bearer ${sameLength}`))).toBe("unauthorized");
  });

  it("rejects a request carrying no credentials at all", () => {
    expect(authorizeReadRequest(readRequest())).toBe("unauthorized");
  });

  it("reports a missing token as configuration rather than as a rejected caller", () => {
    delete process.env.API_READ_TOKEN;
    expect(authorizeReadRequest(readRequest(`Bearer ${READ_TOKEN}`))).toBe("not-configured");
  });
});

describe("rejectUnauthorizedRead", () => {
  const original = process.env.API_READ_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.API_READ_TOKEN;
    else process.env.API_READ_TOKEN = original;
    vi.restoreAllMocks();
  });

  it("lets an authorised request through", () => {
    process.env.API_READ_TOKEN = READ_TOKEN;
    expect(rejectUnauthorizedRead(readRequest(`Bearer ${READ_TOKEN}`))).toBeNull();
  });

  it("closes the API when the token is missing instead of serving it openly", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.API_READ_TOKEN;

    const response = rejectUnauthorizedRead(readRequest());

    expect(response?.status).toBe(503);
  });

  it("records the misconfiguration rather than failing silently", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.API_READ_TOKEN;

    rejectUnauthorizedRead(readRequest());

    expect(logged).toHaveBeenCalled();
  });

  it("answers 401 without hinting at what a valid token looks like", async () => {
    process.env.API_READ_TOKEN = READ_TOKEN;

    const response = rejectUnauthorizedRead(readRequest("Bearer wrong"));
    const body = await response?.json();

    expect(response?.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("never lets a rejection be cached", () => {
    process.env.API_READ_TOKEN = READ_TOKEN;

    const response = rejectUnauthorizedRead(readRequest("Bearer wrong"));

    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(response?.headers.get("cdn-cache-control")).toBe("no-store");
  });
});
