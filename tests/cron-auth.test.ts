import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authorizeCronRequest } from "../src/lib/api/cron-auth";

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
