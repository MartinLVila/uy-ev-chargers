import { describe, expect, it } from "vitest";
import type { IngestOptions } from "../src/lib/ingest/pipeline";
import { successFeed } from "./helpers/feed";

describe("IngestOptions", () => {
  it("does not accept a call that leaves the feed source to the pipeline", () => {
    // @ts-expect-error the caller has to say which feed it ingested
    const withoutFeed: IngestOptions = { observedAt: new Date() };

    expect(withoutFeed).toBeDefined();
  });

  it("accepts a call that names the feed", () => {
    const withFeed: IngestOptions = { feed: successFeed([]), observedAt: new Date() };

    expect(withFeed.feed.outcome).toBe("success");
  });
});
