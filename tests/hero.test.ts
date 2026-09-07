import { describe, expect, it } from "vitest";
import { heroRingGeometry, mostRecentPollFailed, outOfServiceSentence } from "../src/lib/ui/hero";

describe("outOfServiceSentence survives the ratios that break a naive template", () => {
  it("says nothing when there is no fleet to speak of", () => {
    expect(outOfServiceSentence(0, 0)).toBeNull();
  });

  it("says nothing is down when the ratio is exactly zero", () => {
    expect(outOfServiceSentence(0, 600)).toBe("Ninguno está fuera de servicio en este momento.");
  });

  it("says everything is down rather than 'uno de cada uno' when the ratio is 1", () => {
    expect(outOfServiceSentence(600, 600)).toBe(
      "Todos los enchufes de la red están fuera de servicio en este momento.",
    );
  });

  it("avoids 'uno de cada uno' just under a full outage too", () => {
    expect(outOfServiceSentence(590, 600)).toBe(
      "Más de uno de cada dos enchufes de la red no puede cargar un auto en este momento.",
    );
  });

  it("names the real denominator for an ordinary ratio", () => {
    expect(outOfServiceSentence(1, 11)).toBe(
      "Uno de cada 11 enchufes de la red no puede cargar un auto en este momento.",
    );
  });

  it("rounds a tiny ratio to a large denominator instead of overflowing", () => {
    expect(outOfServiceSentence(1, 600)).toBe(
      "Uno de cada 600 enchufes de la red no puede cargar un auto en este momento.",
    );
  });

  it("never produces the literal word Infinity or NaN", () => {
    for (const [outOfService, fleet] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [600, 600],
    ]) {
      const sentence = outOfServiceSentence(outOfService, fleet);
      if (sentence !== null) expect(sentence).not.toMatch(/Infinity|NaN/);
    }
  });
});

describe("heroRingGeometry never divides by a fleet of zero", () => {
  it("returns null instead of NaN when the fleet is zero", () => {
    expect(heroRingGeometry(0, 0)).toBeNull();
  });

  it("draws a full circle when everything is in service", () => {
    const geometry = heroRingGeometry(600, 600);
    expect(geometry?.share).toBe(1);
    expect(geometry?.offset).toBe(0);
  });

  it("draws nothing when nothing is in service", () => {
    const geometry = heroRingGeometry(0, 600);
    expect(geometry?.share).toBe(0);
    expect(geometry?.offset).toBe(geometry?.circumference);
  });

  it("clamps a share above one instead of drawing past a full circle", () => {
    const geometry = heroRingGeometry(700, 600);
    expect(geometry?.share).toBe(1);
    expect(geometry?.offset).toBe(0);
  });

  it("computes the offset as a fraction of the circumference", () => {
    const geometry = heroRingGeometry(300, 600);
    expect(geometry?.share).toBe(0.5);
    expect(geometry?.offset).toBeCloseTo(geometry!.circumference / 2, 5);
  });
});

describe("mostRecentPollFailed reads which timestamp is newer", () => {
  it("is false when nothing has ever failed", () => {
    expect(mostRecentPollFailed("2026-09-07T12:00:00.000Z", null)).toBe(false);
  });

  it("is false when the last success is newer than the last failure", () => {
    expect(
      mostRecentPollFailed("2026-09-07T12:00:00.000Z", "2026-09-07T10:00:00.000Z"),
    ).toBe(false);
  });

  it("is true when the last failure is newer than the last success", () => {
    expect(
      mostRecentPollFailed("2026-09-07T10:00:00.000Z", "2026-09-07T12:00:00.000Z"),
    ).toBe(true);
  });

  it("is true when there has never been a successful poll but a failure exists", () => {
    expect(mostRecentPollFailed(null, "2026-09-07T12:00:00.000Z")).toBe(true);
  });

  it("is false when there is no data at all", () => {
    expect(mostRecentPollFailed(null, null)).toBe(false);
  });
});
