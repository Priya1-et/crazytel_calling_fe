/** Crazytel verified CLI/DID: E.164 without + (e.g. 61272643281). Accepts legacy 0… national input. */
export function toE164Cli(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.startsWith('61')) return d;
  if (d.startsWith('0') && d.length === 10) return `61${d.slice(1)}`;
  return d;
}
