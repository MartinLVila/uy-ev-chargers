import { describe, expect, it } from "vitest";
import { clientIdentifier, requestUnitsForWindow } from "../src/lib/api/rate-limit";
import { rateLimitedResponse } from "../src/lib/api/response";

function requestWith(headers: Record<string, string>): Request {
  return new Request("https://example.test/api/metrics/overview", { headers });
}

describe("clientIdentifier", () => {
  it("trusts the address the platform resolved over anything the client sent", () => {
    const request = requestWith({
      "x-real-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.7",
    });

    expect(clientIdentifier(request)).toBe("203.0.113.10");
  });

  it("takes the last hop so a client cannot pick its own bucket by prepending one", () => {
    const request = requestWith({ "x-forwarded-for": "1.2.3.4, 203.0.113.10" });

    expect(clientIdentifier(request)).toBe("203.0.113.10");
  });

  it("prefers the platform forwarding header over the client-writable one", () => {
    const request = requestWith({
      "x-vercel-forwarded-for": "203.0.113.10",
      "x-forwarded-for": "1.2.3.4",
    });

    expect(clientIdentifier(request)).toBe("203.0.113.10");
  });

  it("falls back to a single shared bucket when no address can be established", () => {
    expect(clientIdentifier(requestWith({}))).toBe("unidentified-client");
  });

  it("ignores an empty forwarding header rather than bucketing by empty string", () => {
    expect(clientIdentifier(requestWith({ "x-forwarded-for": " , " }))).toBe("unidentified-client");
  });
});

describe("requestUnitsForWindow", () => {
  it("charges one unit for an ordinary dashboard window", () => {
    expect(requestUnitsForWindow(30)).toBe(1);
    expect(requestUnitsForWindow(90)).toBe(1);
  });

  it("charges more for the wide windows that scan the most history", () => {
    expect(requestUnitsForWindow(180)).toBe(2);
    expect(requestUnitsForWindow(730)).toBe(9);
  });

  it("never charges less than one unit, whatever arrives", () => {
    expect(requestUnitsForWindow(0)).toBe(1);
    expect(requestUnitsForWindow(-500)).toBe(1);
    expect(requestUnitsForWindow(Number.NaN)).toBe(1);
  });
});

describe("rateLimitedResponse", () => {
  it("answers 429 and says when to come back", () => {
    const response = rateLimitedResponse(42);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
  });

  it("keeps the rejection out of every cache, including the edge", () => {
    const response = rateLimitedResponse(1);

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  });

  it("does not disclose which limit was hit", async () => {
    const body = await rateLimitedResponse(1).json();

    expect(body).toEqual({ error: "Too many requests" });
  });
});
