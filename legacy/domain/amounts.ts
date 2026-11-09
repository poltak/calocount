/**
 * Round an amount to three decimal places.
 *
 * Adding stored decimals leaves binary float noise, such as 2386.6769999999997.
 * Three places keeps every tracked unit exact enough, including micrograms.
 */
export function roundAmount(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Round a known amount and keep an unknown one as `null`. */
export function roundNullableAmount(value: number | null): number | null {
  return value === null ? null : roundAmount(value);
}
