import { formatConnectorHours, formatNumber } from "./format";

export const RANKING_WINDOW_DAYS = 15;

export function outageRankingSentence(outOfServiceSeconds: number): string {
  return `La estación con más horas·conector caídas del país en los últimos ${RANKING_WINDOW_DAYS} días: ${formatConnectorHours(
    outOfServiceSeconds,
  )}.`;
}

export function currentOutageSentence(outOfService: number, total: number): string | null {
  if (outOfService <= 0 || total <= 0) return null;

  const connectorWord = total === 1 ? "conector" : "conectores";
  const verb = outOfService === 1 ? "reporta" : "reportan";

  return `${formatNumber(outOfService)} de sus ${formatNumber(
    total,
  )} ${connectorWord} no ${verb} servicio ahora mismo.`;
}

export function outageSuperlative(
  isNationalWorst: boolean,
  outOfServiceSeconds: number,
  currentlyOutOfService: number,
  totalConnectors: number,
): string | null {
  if (!isNationalWorst) return null;

  const ranking = outageRankingSentence(outOfServiceSeconds);
  const current = currentOutageSentence(currentlyOutOfService, totalConnectors);

  return current ? `${ranking} ${current}` : ranking;
}
