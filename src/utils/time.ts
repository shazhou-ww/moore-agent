export const before = (timestamp: number, offsetMs: number): number =>
  timestamp - offsetMs;

export const maxTimestamp = (...values: readonly number[]): number =>
  values.reduce((acc, value) => (value > acc ? value : acc), Number.NEGATIVE_INFINITY);

