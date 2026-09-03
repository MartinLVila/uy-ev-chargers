import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SchemaCheck, SchemaFault } from "../src/lib/db/schema-check";

const TOKEN = "a-token-only-the-caller-and-the-server-know";

const check = vi.hoisted(() => ({ result: { matches: true, faults: [] } as SchemaCheck }));

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({ execute: () => Promise.resolve({ rows: [] }) }),
}));

vi.mock("@/lib/db/schema-check", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/db/schema-check")>(
    "../src/lib/db/schema-check",
  );
  return { ...actual, checkSchema: () => Promise.resolve(check.result) };
});

function behind(...faults: SchemaFault[]): SchemaCheck {
  return { matches: false, faults };
}

async function callHealth(): Promise<Response> {
  const { GET } = await import("../src/app/api/health/route");
  return GET(
    new Request("https://example.test/api/health", {
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
  );
}

describe("a deploy that outran its migration fails loudly", () => {
  const originalRead = process.env.API_READ_TOKEN;

  beforeEach(() => {
    process.env.API_READ_TOKEN = TOKEN;
    check.result = { matches: true, faults: [] };
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalRead === undefined) delete process.env.API_READ_TOKEN;
    else process.env.API_READ_TOKEN = originalRead;
    vi.restoreAllMocks();
  });

  it("answers 503 and names the column the database is missing", async () => {
    check.result = behind({
      table: "connector_states",
      column: "status_detail_key",
      problem: "absent",
    });

    const response = await callHealth();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "schema_behind",
      faults: [{ table: "connector_states", column: "status_detail_key", problem: "absent" }],
    });
  });

  it("says so when a column is there but the database will never fill it", async () => {
    check.result = behind({
      table: "connector_states",
      column: "status_detail_key",
      problem: "not generated",
    });

    const response = await callHealth();

    expect(response.status).toBe(503);
    expect(await response.text()).toContain("not generated");
  });

  it("leaves a trace naming what is wrong rather than a bare failure", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    check.result = behind({ table: "stations", column: "slug", problem: "absent" });

    await callHealth();

    expect(logged.mock.calls.flat().join(" ")).toContain("stations.slug (absent)");
  });

  it("still answers ok when the database has everything the code reads", async () => {
    const response = await callHealth();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  it("asks the database about its schema once rather than on every request", async () => {
    const asked = vi.fn(() => Promise.resolve({ matches: true, faults: [] } as SchemaCheck));
    vi.doMock("@/lib/db/schema-check", async () => {
      const actual = await vi.importActual<typeof import("../src/lib/db/schema-check")>(
        "../src/lib/db/schema-check",
      );
      return { ...actual, checkSchema: asked };
    });

    const { GET } = await import("../src/app/api/health/route");
    const call = () =>
      GET(
        new Request("https://example.test/api/health", {
          headers: { authorization: `Bearer ${TOKEN}` },
        }),
      );

    await call();
    await call();
    await call();

    expect(asked).toHaveBeenCalledTimes(1);
  });
});
