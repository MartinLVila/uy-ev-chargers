import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import {
  locatorAdvice,
  locatorFailureFor,
  pageMayLocate,
  type LocatorFailure,
  type PolicyView,
} from "../src/lib/ui/near-me";

async function permissionsPolicies(): Promise<string[]> {
  const routes = await nextConfig.headers!();

  return routes.flatMap((route) =>
    route.headers
      .filter((header) => header.key === "Permissions-Policy")
      .map((header) => header.value),
  );
}

describe("the Permissions-Policy header leaves room for the only browser feature the site uses", () => {
  it("allows this origin's own documents to call geolocation", async () => {
    const policies = await permissionsPolicies();

    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toContain("geolocation=(self)");
    }
  });

  it("still denies every feature the site has no interface for", async () => {
    const policies = await permissionsPolicies();

    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toContain("camera=()");
      expect(policy).toContain("microphone=()");
      expect(policy).toContain("interest-cohort=()");
    }
  });
});

describe("a refusal the visitor did not make is never reported as their choice", () => {
  const PERMISSION_DENIED = 1;
  const POSITION_UNAVAILABLE = 2;
  const TIMEOUT = 3;

  function policyThatDenies(feature: string): PolicyView {
    return { allowsFeature: (asked) => asked !== feature };
  }

  it("reads the page's own policy rather than assuming the call was allowed", () => {
    expect(pageMayLocate(policyThatDenies("geolocation"))).toBe(false);
    expect(pageMayLocate(policyThatDenies("camera"))).toBe(true);
  });

  it("assumes the page may ask when the browser exposes no policy to read", () => {
    expect(pageMayLocate(undefined)).toBe(true);
  });

  it("blames the page when the page's own policy is what blocked the call", () => {
    const blocked = pageMayLocate(policyThatDenies("geolocation"));
    const failure = locatorFailureFor(PERMISSION_DENIED, blocked);

    expect(failure).toBe("blocked-by-this-page");
    expect(locatorAdvice(failure)).toContain("Esta página");
  });

  it("points at the browser permission when the page is allowed to ask", () => {
    const failure = locatorFailureFor(PERMISSION_DENIED, pageMayLocate(undefined));

    expect(failure).toBe("not-granted");
    expect(locatorAdvice(failure)).toContain("candado");
  });

  it("keeps the timeout and the unavailable fix apart", () => {
    expect(locatorFailureFor(TIMEOUT, true)).toBe("timed-out");
    expect(locatorFailureFor(POSITION_UNAVAILABLE, true)).toBe("unavailable");
  });
});

describe("every way the locator can fail says something distinct and something useful", () => {
  const adviceByFailure: Record<LocatorFailure, string> = {
    unsupported: locatorAdvice("unsupported"),
    "blocked-by-this-page": locatorAdvice("blocked-by-this-page"),
    "not-granted": locatorAdvice("not-granted"),
    unavailable: locatorAdvice("unavailable"),
    "timed-out": locatorAdvice("timed-out"),
  };

  it("never repeats one failure's wording for another", () => {
    const wordings = Object.values(adviceByFailure);

    expect(wordings.length).toBeGreaterThan(1);
    expect(new Set(wordings).size).toBe(wordings.length);
  });

  it("always leaves the visitor the locality list as a way out", () => {
    const wordings = Object.values(adviceByFailure);

    expect(wordings.length).toBeGreaterThan(1);
    for (const wording of wordings) {
      expect(wording).toContain("de la lista de abajo");
    }
  });

  it("never attributes the failure to something the visitor chose", () => {
    const wordings = Object.values(adviceByFailure);

    expect(wordings.length).toBeGreaterThan(1);
    for (const wording of wordings) {
      expect(wording).not.toMatch(/no (nos )?diste|rechazaste|negaste/i);
    }
  });
});
