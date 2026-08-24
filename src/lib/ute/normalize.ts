const DEPARTMENTS = [
  "Artigas",
  "Canelones",
  "Cerro Largo",
  "Colonia",
  "Durazno",
  "Flores",
  "Florida",
  "Lavalleja",
  "Maldonado",
  "Montevideo",
  "Paysandú",
  "Río Negro",
  "Rivera",
  "Rocha",
  "Salto",
  "San José",
  "Soriano",
  "Tacuarembó",
  "Treinta y Tres",
] as const;

type Department = (typeof DEPARTMENTS)[number];

export const UNKNOWN_DEPARTMENT = "Desconocido";

export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const DEPARTMENT_BY_FOLDED = new Map<string, Department>(
  DEPARTMENTS.map((name) => [fold(name), name]),
);

export function normalizeDepartment(raw: string | null | undefined): string {
  if (!raw) return UNKNOWN_DEPARTMENT;
  return DEPARTMENT_BY_FOLDED.get(fold(raw)) ?? UNKNOWN_DEPARTMENT;
}

export function normalizeText(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function coordinateKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

export function slugify(value: string): string {
  const slug = fold(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "station";
}
