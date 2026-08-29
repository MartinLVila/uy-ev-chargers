import { describe, expect, it } from "vitest";
import type { IngestOptions } from "../src/lib/ingest/pipeline";
import { successFeed } from "./helpers/feed";

type FeedIsRequired = Record<string, never> extends Pick<IngestOptions, "feed"> ? false : true;

describe("IngestOptions", () => {
  it("does not let the caller leave the feed source to the pipeline", () => {
    const feedIsRequired: FeedIsRequired = true;

    expect(feedIsRequired).toBe(true);
  });

  it("accepts a call that names the feed", () => {
    const withFeed: IngestOptions = { feed: successFeed([]), observedAt: new Date() };

    expect(withFeed.feed.outcome).toBe("success");
  });
});
