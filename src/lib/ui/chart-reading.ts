export interface Reading {
  index: number;
  spoken: boolean;
}

function within(index: number, lastIndex: number): number {
  return Math.min(lastIndex, Math.max(0, index));
}

export function readingUnderPointer(current: Reading | null, index: number): Reading {
  return current && current.index === index && !current.spoken ? current : { index, spoken: false };
}

export function readingAt(index: number, lastIndex: number): Reading {
  return { index: within(index, lastIndex), spoken: true };
}

export function readingStepped(
  current: Reading | null,
  delta: number,
  lastIndex: number,
): Reading {
  return readingAt(current === null ? lastIndex : current.index + delta, lastIndex);
}

export function isSpoken(reading: Reading | null): boolean {
  return reading?.spoken === true;
}
