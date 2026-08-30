import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rejectUnauthorizedRead } from "@/lib/api/authorization";
import { READ_ROUTES } from "./helpers/read-routes";

vi.mock("@/lib/api/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api/rate-limit")>(
    "../src/lib/api/rate-limit",
  );
  return { ...actual, rejectIfRateLimited: () => Promise.resolve(null) };
});

const CONFIGURED_TOKEN = "a-token-no-caller-here-knows";
const GUESS_OF_THE_SAME_LENGTH = "b-token-no-caller-here-knows";

const REJECTED_CREDENTIALS = [
  { shape: "nothing at all", headers: {} },
  { shape: "an empty bearer token", headers: { authorization: "Bearer " } },
  { shape: "a shorter bearer token", headers: { authorization: "Bearer not-the-token" } },
  {
    shape: "a bearer token of the configured length",
    headers: { authorization: `Bearer ${GUESS_OF_THE_SAME_LENGTH}` },
  },
  {
    shape: "a longer bearer token",
    headers: { authorization: "Bearer not-the-token-and-appreciably-longer" },
  },
  { shape: "a scheme that is not bearer", headers: { authorization: "Basic dXNlcjpwYXNz" } },
] as const;

type Fingerprint = { status: number; body: string; headers: string };

function readRequest(url: string, headers: Record<string, string>): Request {
  return new Request(url, { headers });
}

async function fingerprintOf(response: Response): Promise<Fingerprint> {
  return {
    status: response.status,
    body: await response.text(),
    headers: [...response.headers.entries()]
      .map(([name, value]) => `${name}: ${value}`)
      .sort()
      .join("\n"),
  };
}

describe("a rejected read looks the same whatever credential was rejected", () => {
  const original = process.env.API_READ_TOKEN;

  beforeEach(() => {
    process.env.API_READ_TOKEN = CONFIGURED_TOKEN;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (original === undefined) delete process.env.API_READ_TOKEN;
    else process.env.API_READ_TOKEN = original;
    vi.restoreAllMocks();
  });

  it("reaches the constant-time comparison rather than stopping at the length check", () => {
    expect(GUESS_OF_THE_SAME_LENGTH).toHaveLength(CONFIGURED_TOKEN.length);
    expect(GUESS_OF_THE_SAME_LENGTH).not.toBe(CONFIGURED_TOKEN);
  });

  it("gives every rejected credential a byte-identical response", async () => {
    const fingerprints: Array<{ shape: string; fingerprint: Fingerprint }> = [];

    for (const credential of REJECTED_CREDENTIALS) {
      const rejection = rejectUnauthorizedRead(
        readRequest("https://example.test/api/stations", credential.headers),
      );
      expect(rejection, `${credential.shape} was not rejected`).not.toBeNull();
      fingerprints.push({ shape: credential.shape, fingerprint: await fingerprintOf(rejection!) });
    }

    const [reference, ...rest] = fingerprints;
    expect(reference.fingerprint.status).toBe(401);

    for (const other of rest) {
      expect(
        other.fingerprint,
        `${other.shape} answered differently from ${reference.shape}`,
      ).toEqual(reference.fingerprint);
    }
  });

  it("never names the rejection reason that the log records", async () => {
    const reasons = ["no value", "did not match", "not a bearer token", "bearer"];

    for (const credential of REJECTED_CREDENTIALS) {
      const rejection = rejectUnauthorizedRead(
        readRequest("https://example.test/api/stations", credential.headers),
      );
      expect(rejection).not.toBeNull();
      const body = (await rejection!.text()).toLowerCase();

      for (const reason of reasons) {
        expect(body, `${credential.shape} leaked "${reason}"`).not.toContain(reason);
      }
    }
  });

  it("never echoes the token that was sent, nor the one that was expected", async () => {
    const guess = "a-guess-that-should-never-be-echoed";

    const rejection = rejectUnauthorizedRead(
      readRequest("https://example.test/api/stations", { authorization: `Bearer ${guess}` }),
    );
    expect(rejection).not.toBeNull();
    const body = await rejection!.text();

    expect(body).not.toContain(guess);
    expect(body).not.toContain(process.env.API_READ_TOKEN!);
  });

  for (const route of READ_ROUTES) {
    it(`${route.name} adds nothing of its own to the rejection`, async () => {
      const fingerprints: Array<{ shape: string; fingerprint: Fingerprint }> = [];

      for (const credential of REJECTED_CREDENTIALS) {
        const response = await route.invoke(readRequest(route.url, credential.headers));
        fingerprints.push({ shape: credential.shape, fingerprint: await fingerprintOf(response) });
      }

      const [reference, ...rest] = fingerprints;
      expect(reference.fingerprint.status).toBe(401);

      for (const other of rest) {
        expect(
          other.fingerprint,
          `${other.shape} answered differently from ${reference.shape}`,
        ).toEqual(reference.fingerprint);
      }
    });
  }
});
