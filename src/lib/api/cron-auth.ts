import { timingSafeEqual } from "node:crypto";

export type CronAuthResult = "authorized" | "unauthorized" | "not-configured";

export function authorizeCronRequest(request: Request): CronAuthResult {
  const expected = process.env.CRON_SECRET;
  if (!expected) return "not-configured";

  const presented = bearerToken(request.headers.get("authorization"));
  if (presented === null) return "unauthorized";

  return equalsInConstantTime(presented, expected) ? "authorized" : "unauthorized";
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

function equalsInConstantTime(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}
