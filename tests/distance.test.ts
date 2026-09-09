import { describe, expect, it } from "vitest";
import { haversineKm } from "../src/lib/ui/distance";

describe("haversineKm measures real straight-line distance, not a placeholder", () => {
  it("is zero for the same point", () => {
    expect(haversineKm(-34.9, -56.16, -34.9, -56.16)).toBeCloseTo(0, 5);
  });

  it("matches the known distance between Montevideo and Punta del Este within a few km", () => {
    const km = haversineKm(-34.9, -56.16, -34.96, -54.95);
    expect(km).toBeGreaterThan(105);
    expect(km).toBeLessThan(120);
  });

  it("makes one degree of latitude the sphere's circumference over 360", () => {
    const degreeOfLatitude = (2 * Math.PI * 6371) / 360;

    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(degreeOfLatitude, 6);
    expect(haversineKm(-34, -56, -35, -56)).toBeCloseTo(degreeOfLatitude, 6);
  });

  it("matches the published Montevideo to Buenos Aires great-circle distance", () => {
    const km = haversineKm(-34.9011, -56.1645, -34.6037, -58.3816);

    expect(km).toBeGreaterThan(200);
    expect(km).toBeLessThan(210);
  });

  it("makes a quarter turn of the equator a quarter of the circumference", () => {
    expect(haversineKm(0, 0, 0, 90)).toBeCloseTo((2 * Math.PI * 6371) / 4, 6);
  });
});
