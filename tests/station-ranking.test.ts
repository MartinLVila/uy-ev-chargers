import { describe, expect, it } from "vitest";
import {
  currentOutageSentence,
  outageRankingSentence,
  outageSuperlative,
} from "../src/lib/ui/station-ranking";

describe("the ranking sentence names the real window and the real total", () => {
  it("names the 15-day window and the connector-hours down", () => {
    expect(outageRankingSentence(1036 * 3600)).toBe(
      "La estación con más horas·conector caídas del país en los últimos 15 días: 1.036.",
    );
  });
});

describe("the current-count sentence agrees in number", () => {
  it("uses the plural verb and noun for more than one connector out", () => {
    expect(currentOutageSentence(3, 7)).toBe(
      "3 de sus 7 conectores no reportan servicio ahora mismo.",
    );
  });

  it("uses the singular verb for exactly one connector out", () => {
    expect(currentOutageSentence(1, 7)).toBe(
      "1 de sus 7 conectores no reporta servicio ahora mismo.",
    );
  });

  it("uses the singular noun when the station itself has one connector", () => {
    expect(currentOutageSentence(1, 1)).toBe(
      "1 de sus 1 conector no reporta servicio ahora mismo.",
    );
  });

  it("says nothing when nothing is out of service right now", () => {
    expect(currentOutageSentence(0, 7)).toBeNull();
  });

  it("says nothing when the station has no connectors at all", () => {
    expect(currentOutageSentence(0, 0)).toBeNull();
  });
});

describe("the superlative paragraph only exists for the actual national worst", () => {
  it("says nothing at all for a station that is not the national worst", () => {
    expect(outageSuperlative(false, 1036 * 3600, 3, 7)).toBeNull();
  });

  it("combines both claims for the national worst that is also down right now", () => {
    expect(outageSuperlative(true, 1036 * 3600, 3, 7)).toBe(
      "La estación con más horas·conector caídas del país en los últimos 15 días: 1.036. 3 de sus 7 conectores no reportan servicio ahora mismo.",
    );
  });

  it("drops the current-count claim rather than stating a falsehood when nothing is down now", () => {
    expect(outageSuperlative(true, 1036 * 3600, 0, 7)).toBe(
      "La estación con más horas·conector caídas del país en los últimos 15 días: 1.036.",
    );
  });
});
