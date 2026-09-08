import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DepartmentChart } from "../src/components/DepartmentChart";
import type { DepartmentBreakdown } from "../src/lib/metrics/queries";

function department(overrides: Partial<DepartmentBreakdown> = {}): DepartmentBreakdown {
  return {
    department: "Montevideo",
    stations: 61,
    connectors: 200,
    operational: 190,
    faulted: 10,
    absent: 8,
    outOfService: 18,
    ...overrides,
  };
}

function render(departments: DepartmentBreakdown[]): string {
  return renderToStaticMarkup(createElement(DepartmentChart, { departments }));
}

describe("a department's bar is scaled to the largest department, not to 100%", () => {
  it("names the department it is scaled against, visibly", () => {
    const markup = render([
      department({ department: "Montevideo", connectors: 200, absent: 8, outOfService: 18 }),
      department({ department: "Artigas", connectors: 4, absent: 0, outOfService: 0 }),
    ]);

    expect(markup).toContain("escala de Montevideo");
  });

  it("draws a department at half of the largest department's fleet at half width", () => {
    const markup = render([
      department({ department: "Montevideo", connectors: 200, absent: 0, outOfService: 0 }),
      department({ department: "Canelones", connectors: 100, absent: 0, outOfService: 0 }),
    ]);

    expect(markup).toContain("width:50%");
  });

  it("does not scale a department against its own total", () => {
    const markup = render([
      department({ department: "Montevideo", connectors: 200, absent: 0, outOfService: 0 }),
      department({ department: "Artigas", connectors: 4, absent: 0, outOfService: 0 }),
    ]);

    expect(markup, "4 of its own 4 connectors would be a full bar; it must read as 2% of Montevideo").toContain(
      "width:2%",
    );
  });
});

describe("a department with no name UTE reported still gets a row", () => {
  it("keeps Desconocido visible rather than filtering it out", () => {
    const markup = render([
      department({ department: "Montevideo", connectors: 200 }),
      department({ department: "Desconocido", connectors: 25, absent: 0, outOfService: 0 }),
    ]);

    expect(markup).toContain("Desconocido");
  });
});

describe("a department with nothing installed does not get a row at all", () => {
  it("drops a department whose fleet is zero", () => {
    const markup = render([
      department({ department: "Montevideo", connectors: 200 }),
      department({ department: "Vacío", connectors: 0, absent: 0, outOfService: 0 }),
    ]);

    expect(markup).not.toContain("Vacío");
  });
});
