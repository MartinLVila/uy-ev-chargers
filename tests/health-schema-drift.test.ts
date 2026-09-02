import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { columnsTheCodeExpects } from "../src/lib/db/schema-check";

const TOKEN = "a-token-only-the-caller-and-the-server-know";

const columnRows = vi.hoisted(() => ({ rows: [] as { table_name: string; column_name: string }[] }));

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({
    execute: (query: { queryChunks?: unknown[] }) =>
      Promise.resolve(
        JSON.stringify(query.queryChunks ?? "").includes("information_schema")
          ? columnRows
          : { rows: [] },
      ),
  }),
}));

function everyColumnPresent(): { table_name: string; column_name: string }[] {
  return columnsTheCodeExpects().map(({ table, column }) => ({
    table_name: table,
    column_name: column,
  }));
}

async function callHealth(): Promise<Response> {
  const { GET } = await import("../src/app/api/health/route");
  return GET(new Request("https://example.test/api/health", {
    headers: { authorization: `Bearer ${TOKEN}` },
  }));
}

describe("a deploy that outran its migration fails loudly", () => {
  const originalRead = process.env.API_READ_TOKEN;

  beforeEach(() => {
    process.env.API_READ_TOKEN = TOKEN;
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalRead === undefined) delete process.env.API_READ_TOKEN;
    else process.env.API_READ_TOKEN = originalRead;
    vi.restoreAllMocks();
  });

  it("answers 503 and names the column the database is missing", async () => {
    columnRows.rows = everyColumnPresent().filter(
      (row) => !(row.table_name === "connector_states" && row.column_name === "status_detail_key"),
    );

    const response = await callHealth();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "schema_behind",
      missing: [{ table: "connector_states", column: "status_detail_key" }],
    });
  });

  it("leaves a trace naming what is missing rather than a bare failure", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    columnRows.rows = everyColumnPresent().filter(
      (row) => !(row.table_name === "stations" && row.column_name === "slug"),
    );

    await callHealth();

    expect(logged.mock.calls.flat().join(" ")).toContain("stations.slug");
  });

  it("still answers ok when the database has everything the code reads", async () => {
    columnRows.rows = everyColumnPresent();

    const response = await callHealth();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  it("does not answer ok while the schema is behind", async () => {
    columnRows.rows = everyColumnPresent().slice(0, 3);

    const response = await callHealth();

    expect(response.status).not.toBe(200);
    expect(await response.text()).not.toContain('"status":"ok"');
  });
});
