/** Format AU numbers for display (E.164 61… or national 0…). */
export function formatAuNumber(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('61') && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  if (digits.length === 10 && digits.startsWith('0')) {
    if (
      digits.startsWith('02') ||
      digits.startsWith('03') ||
      digits.startsWith('07') ||
      digits.startsWith('08')
    ) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)} ${digits.slice(6)}`;
    }
    if (digits.startsWith('04')) {
      return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    }
  }
  return raw;
}
