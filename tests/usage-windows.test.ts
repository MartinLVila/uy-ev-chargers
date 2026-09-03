import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectorUsageProfile } from "../src/components/ConnectorUsageProfile";
import { buildUsageProfiles } from "../src/lib/ui/hourly-usage";
import { describeUsagePattern, usagePattern, type UsagePattern } from "../src/lib/ui/usage-windows";
import type { ConnectorGroupHourlyUsage, StationHourlyUsagePoint } from "../src/lib/metrics/queries";

const OBSERVED_HOURS = 40;

function hours(shape: (hour: number) => Partial<StationHourlyUsagePoint>): StationHourlyUsagePoint[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    utilization: 0,
    brokenShare: 0,
    observedHours: OBSERVED_HOURS,
    ...shape(hour),
  }));
}

function groupOf(points: StationHourlyUsagePoint[]): ConnectorGroupHourlyUsage {
  return {
    connectorGroupId: 1,
    connectorType: "CCS",
    powerKw: 50,
    hasCable: true,
    connectorCount: 1,
    hours: points,
  };
}

function patternOf(points: StationHourlyUsagePoint[]): UsagePattern {
  return usagePattern(buildUsageProfiles([groupOf(points)])[0]);
}

const eveningRush = hours((hour) => ({
  utilization: hour >= 18 && hour <= 21 ? 0.9 : 0.05,
}));

describe("the charger says when to come", () => {
  it("names the busy window and the free window", () => {
    const pattern = patternOf(eveningRush);

    expect(pattern.kind).toBe("clear");
    if (pattern.kind !== "clear") return;

    expect(pattern.busy.fromHour).toBe(18);
    expect(pattern.busy.untilHour).toBe(21);
    expect(pattern.busy.utilization).toBeCloseTo(0.9, 5);
    expect(pattern.free.utilization).toBeCloseTo(0.05, 5);
  });

  it("says «free except» rather than naming a twenty-hour free window", () => {
    const sentence = describeUsagePattern(patternOf(eveningRush));

    expect(sentence).toBe(
      "Suele estar libre, salvo entre las 18:00 y las 22:00, cuando llega a 90,0% de uso.",
    );
  });

  it("names both windows when each is a real part of the day", () => {
    const workingDay = patternOf(
      hours((hour) => {
        if (hour >= 8 && hour <= 17) return { utilization: 0.85 };
        if (hour >= 20 || hour <= 5) return { utilization: 0.1 };
        return { utilization: 0.45 };
      }),
    );
    const sentence = describeUsagePattern(workingDay);

    expect(sentence).toContain("más ocupado entre las 08:00 y las 18:00");
    expect(sentence).toContain("más libre entre las 20:00 y las 06:00");
  });

  it("puts the sentence on the page, above the chart", () => {
    const markup = renderToStaticMarkup(
      createElement(ConnectorUsageProfile, { groups: [groupOf(eveningRush)] }),
    );

    expect(markup).toContain("Suele estar libre, salvo entre las 18:00 y las 22:00");
    expect(markup, "the sentence must not read as a live reading").toContain("no una lectura en vivo");
    expect(markup.indexOf("Suele estar libre")).toBeLessThan(markup.indexOf('role="img"'));
  });

  it("carries a window that wraps past midnight", () => {
    const pattern = patternOf(hours((hour) => ({ utilization: hour >= 22 || hour <= 2 ? 0.8 : 0.1 })));

    expect(pattern.kind).toBe("clear");
    if (pattern.kind !== "clear") return;

    expect(pattern.busy.fromHour).toBe(22);
    expect(pattern.busy.untilHour).toBe(2);
  });
});

describe("the charger stays quiet when the evidence does not support a claim", () => {
  it("says nothing about hours when barely any hour was observed", () => {
    const barely = hours((hour) => ({
      utilization: hour >= 18 ? 0.9 : 0.05,
      observedHours: hour < 20 ? 0 : OBSERVED_HOURS,
    }));

    expect(patternOf(barely).kind).toBe("not-enough-observation");
  });

  it("never turns a couple of observations into a quietest hour", () => {
    const oneThinHour = hours((hour) => ({
      utilization: hour === 4 ? 0 : 0.6,
      observedHours: hour === 4 ? 1 : OBSERVED_HOURS,
    }));
    const pattern = patternOf(oneThinHour);

    expect(pattern.kind, "a single sparse hour became the headline").toBe("no-clear-pattern");
    expect(describeUsagePattern(pattern)).not.toContain("04:00");
  });

  it("refuses to call a favourite hour when the day is flat", () => {
    const flat = patternOf(hours((hour) => ({ utilization: hour % 2 === 0 ? 0.3 : 0.35 })));

    expect(flat.kind).toBe("no-clear-pattern");
    expect(describeUsagePattern(flat)).toContain("No hay una hora mejor que otra");
  });

  it("never offers a broken window as the best time to come", () => {
    const brokenOvernight = patternOf(
      hours((hour) => (hour <= 5 ? { utilization: 0, brokenShare: 1 } : { utilization: 0.6 })),
    );
    const sentence = describeUsagePattern(brokenOvernight);

    expect(sentence, "the faulted hours were advertised as free").not.toContain("00:00");
    expect(sentence).not.toContain("06:00");
  });

  it("does not build a habit out of a single day of history", () => {
    const oneDay = patternOf(
      hours((hour) => ({ utilization: hour >= 18 && hour <= 21 ? 0.9 : 0.05, observedHours: 1 })),
    );

    expect(oneDay.kind).toBe("not-enough-observation");
  });

  it("will not draw a superlative about the day from half a clock", () => {
    const halfAClock = patternOf(
      hours((hour) =>
        hour < 12
          ? { utilization: 0, observedHours: 0 }
          : { utilization: hour >= 18 && hour <= 21 ? 0.9 : 0.05 },
      ),
    );

    expect(halfAClock.kind).toBe("not-enough-observation");
  });

  it("picks the longer of two equally busy stretches rather than the first", () => {
    const twoPeaks = patternOf(
      hours((hour) => {
        if (hour >= 7 && hour <= 9) return { utilization: 0.9 };
        if (hour >= 14 && hour <= 20) return { utilization: 0.9 };
        return { utilization: 0.05 };
      }),
    );

    expect(twoPeaks.kind).toBe("clear");
    if (twoPeaks.kind !== "clear") return;

    expect(twoPeaks.busy.fromHour).toBe(14);
    expect(twoPeaks.busy.untilHour).toBe(20);
  });

  it("talks about being broken rather than about timing when it was out of service", () => {
    const broken = patternOf(hours((hour) => ({ utilization: hour >= 18 ? 0.9 : 0.05, brokenShare: 0.8 })));

    expect(broken.kind).toBe("out-of-service");
    expect(describeUsagePattern(broken)).toContain("fuera de servicio");
    expect(describeUsagePattern(broken)).not.toContain("18:00");
  });
});
