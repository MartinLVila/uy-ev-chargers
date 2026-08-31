import { describe, expect, it } from "vitest";
import type { ConnectorGroupHourlyUsage } from "../src/lib/metrics/queries";
import {
  buildUsageProfiles,
  describeUsageHour,
  describeUsageProfile,
  usageProfileName,
} from "../src/lib/ui/hourly-usage";

function group(
  overrides: Partial<ConnectorGroupHourlyUsage> & { hours: ConnectorGroupHourlyUsage["hours"] },
): ConnectorGroupHourlyUsage {
  return {
    connectorGroupId: 1,
    connectorType: "CCS2",
    powerKw: 60,
    hasCable: true,
    connectorCount: 2,
    ...overrides,
  };
}

function everyHour(
  observedHours: number,
  utilization = 0.4,
  brokenShare = 0,
): ConnectorGroupHourlyUsage["hours"] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    utilization,
    brokenShare,
    observedHours,
  }));
}

describe("connector group usage profiles", () => {
  it("fills the whole day and leaves never-observed hours without a value", () => {
    const [profile] = buildUsageProfiles([
      group({ hours: [{ hour: 9, utilization: 0.5, brokenShare: 0, observedHours: 30 }] }),
    ]);

    expect(profile.hours).toHaveLength(24);
    expect(profile.hours[9]).toMatchObject({ coverage: "observed", utilization: 0.5 });
    expect(profile.hours[10]).toMatchObject({ coverage: "unobserved", utilization: null });
    expect(profile.hoursWithoutData).toBe(23);
  });

  it("marks an hour resting on far fewer observations than the best covered one", () => {
    const hours = everyHour(60);
    hours[3] = { hour: 3, utilization: 0.9, brokenShare: 0, observedHours: 2 };

    const [profile] = buildUsageProfiles([group({ hours })]);

    expect(profile.hours[3].coverage).toBe("sparse");
    expect(profile.hours[4].coverage).toBe("observed");
    expect(profile.hoursThinlyObserved).toBe(1);
  });

  it("does not flag a group whose hours are all equally thin", () => {
    const [profile] = buildUsageProfiles([group({ hours: everyHour(2) })]);

    expect(profile.hoursThinlyObserved).toBe(0);
    expect(profile.hours.every((entry) => entry.coverage === "observed")).toBe(true);
  });

  it("judges an hour against its own group, so a newer charger keeps its chart", () => {
    const profiles = buildUsageProfiles([
      group({ connectorGroupId: 1, connectorType: "CCS2", hours: everyHour(60) }),
      group({ connectorGroupId: 2, connectorType: "Tipo 2", powerKw: 22, hours: everyHour(10) }),
    ]);

    const newer = profiles.find((profile) => profile.connectorGroupId === 2);
    expect(newer?.hoursThinlyObserved).toBe(0);
    expect(newer?.busiest).not.toBeNull();
  });

  it("says how deep the observation behind each chart is", () => {
    const profiles = buildUsageProfiles([
      group({ connectorGroupId: 1, connectorType: "CCS2", hours: everyHour(60) }),
      group({ connectorGroupId: 2, connectorType: "Tipo 2", powerKw: 22, hours: everyHour(20) }),
    ]);

    expect(profiles.map((profile) => profile.observedDays)).toEqual([60, 20]);
    expect(describeUsageProfile(profiles[1])).toContain("20 días de observación");
  });

  it("leaves the connector count out rather than reporting a group of none", () => {
    const [profile] = buildUsageProfiles([
      group({ connectorCount: null, hours: everyHour(30) }),
    ]);

    expect(profile.connectorCount).toBeNull();
    expect(usageProfileName(profile)).toBe("CCS2 de 60 kW con cable");
    expect(usageProfileName(profile)).not.toContain("conector");
  });

  it("does not round a briefly observed hour down to no observation at all", () => {
    const [profile] = buildUsageProfiles([
      group({ hours: [{ hour: 9, utilization: 0.5, brokenShare: 0, observedHours: 0.4 }] }),
    ]);

    expect(describeUsageHour(profile, profile.hours[9])).toContain("<1 h observadas");
    expect(describeUsageHour(profile, profile.hours[9])).not.toContain("0 h observadas");
  });

  it("ignores thinly observed hours when naming the busiest and quietest hour", () => {
    const hours = everyHour(60, 0.4);
    hours[7] = { hour: 7, utilization: 0.99, brokenShare: 0, observedHours: 1 };
    hours[18] = { hour: 18, utilization: 0.8, brokenShare: 0, observedHours: 60 };
    hours[4] = { hour: 4, utilization: 0.1, brokenShare: 0, observedHours: 60 };

    const [profile] = buildUsageProfiles([group({ hours })]);

    expect(profile.busiest?.hour).toBe(18);
    expect(profile.quietest?.hour).toBe(4);
  });

  it("reports no peak when every hour it has is thinly observed", () => {
    const hours = everyHour(1);
    hours[12] = { hour: 12, utilization: 0.9, brokenShare: 0, observedHours: 60 };

    const [profile] = buildUsageProfiles([group({ hours })]);

    expect(profile.hoursThinlyObserved).toBe(23);
    expect(profile.busiest?.hour).toBe(12);
  });

  it("counts out-of-service hours apart from busy ones", () => {
    const hours = everyHour(60, 0.9);
    hours[1] = { hour: 1, utilization: 0.9, brokenShare: 0.3, observedHours: 60 };
    hours[2] = { hour: 2, utilization: 0.9, brokenShare: 0.1, observedHours: 60 };

    const [profile] = buildUsageProfiles([group({ hours })]);

    expect(profile.hoursOutOfService).toBe(2);
  });

  it("orders groups by connector type and then by descending power", () => {
    const profiles = buildUsageProfiles([
      group({ connectorGroupId: 1, connectorType: "Tipo 2", powerKw: 22, hours: everyHour(10) }),
      group({ connectorGroupId: 2, connectorType: "CCS2", powerKw: 50, hours: everyHour(10) }),
      group({ connectorGroupId: 3, connectorType: "CCS2", powerKw: 120, hours: everyHour(10) }),
    ]);

    expect(profiles.map((profile) => profile.connectorGroupId)).toEqual([3, 2, 1]);
  });

  it("keeps a single connector group as one ordinary profile", () => {
    const profiles = buildUsageProfiles([group({ hours: everyHour(40) })]);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].hoursWithoutData).toBe(0);
  });

  it("describes the chart with the peak, the gaps and the outages", () => {
    const hours = everyHour(60, 0.2);
    hours[20] = { hour: 20, utilization: 0.75, brokenShare: 0.4, observedHours: 60 };
    hours[5] = { hour: 5, utilization: 0, brokenShare: 0, observedHours: 0 };

    const [profile] = buildUsageProfiles([group({ hours })]);
    const description = describeUsageProfile(profile);

    expect(description).toContain("CCS2 de 60 kW con cable, 2 conectores");
    expect(description).toContain("20:00");
    expect(description).toContain("1 de las 24 horas todavía no se observaron.");
    expect(description).toContain("fuera de servicio en 1 de las 24 horas");
  });

  it("says an unobserved hour has no data instead of calling it empty", () => {
    const [profile] = buildUsageProfiles([
      group({ hours: [{ hour: 9, utilization: 0.5, brokenShare: 0, observedHours: 30 }] }),
    ]);

    expect(describeUsageHour(profile, profile.hours[10])).toContain("Sin datos");
    expect(describeUsageHour(profile, profile.hours[9])).toContain("En uso");
  });
});
