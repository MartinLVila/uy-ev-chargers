export interface ReadRoute {
  name: string;
  url: string;
  invoke: (request: Request) => Promise<Response>;
}

const WIDE_WINDOW = "days=730";

export const READ_ROUTES: ReadRoute[] = [
  {
    name: "GET /api/health",
    url: "https://example.test/api/health",
    invoke: async (request) => (await import("@/app/api/health/route")).GET(request),
  },
  {
    name: "GET /api/stations",
    url: "https://example.test/api/stations",
    invoke: async (request) => (await import("@/app/api/stations/route")).GET(request),
  },
  {
    name: "GET /api/stations/[slug]",
    url: `https://example.test/api/stations/x?${WIDE_WINDOW}`,
    invoke: async (request) =>
      (await import("@/app/api/stations/[slug]/route")).GET(request, {
        params: Promise.resolve({ slug: "x" }),
      }),
  },
  {
    name: "GET /api/metrics/history",
    url: `https://example.test/api/metrics/history?${WIDE_WINDOW}`,
    invoke: async (request) => (await import("@/app/api/metrics/history/route")).GET(request),
  },
  {
    name: "GET /api/metrics/overview",
    url: `https://example.test/api/metrics/overview?${WIDE_WINDOW}`,
    invoke: async (request) => (await import("@/app/api/metrics/overview/route")).GET(request),
  },
  {
    name: "GET /api/metrics/reliability",
    url: `https://example.test/api/metrics/reliability?${WIDE_WINDOW}`,
    invoke: async (request) => (await import("@/app/api/metrics/reliability/route")).GET(request),
  },
  {
    name: "GET /api/metrics/usage",
    url: `https://example.test/api/metrics/usage?${WIDE_WINDOW}`,
    invoke: async (request) => (await import("@/app/api/metrics/usage/route")).GET(request),
  },
];
