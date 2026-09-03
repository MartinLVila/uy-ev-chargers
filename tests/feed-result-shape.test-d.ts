import { describe, expectTypeOf, it } from "vitest";
import type { FeedResult, UnusableFeed, UsableFeed } from "../src/lib/ute/types";
import { station, successFeed } from "./helpers/feed";

describe("a feed that failed cannot carry stations", () => {
  it("gives the failure arms nothing that could be mistaken for observation", () => {
    expectTypeOf<UnusableFeed>().not.toHaveProperty("stations");
    expectTypeOf<UnusableFeed>().not.toHaveProperty("payloadDigest");
  });

  it("keeps the notes channel on both arms, since a success reports on itself too", () => {
    expectTypeOf<UnusableFeed>().toHaveProperty("errorMessage");
    expectTypeOf<UsableFeed>().toHaveProperty("errorMessage");
  });

  it("promises a digest wherever there are stations, rather than perhaps one", () => {
    expectTypeOf<UsableFeed["payloadDigest"]>().toEqualTypeOf<string>();
  });

  it("narrows to the success arm on the outcome alone", () => {
    const feed = successFeed([station()]) as FeedResult;

    if (feed.outcome !== "success") throw new Error("unreachable");
    expectTypeOf(feed).toEqualTypeOf<UsableFeed>();
  });
});
