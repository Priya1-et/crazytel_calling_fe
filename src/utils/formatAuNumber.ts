/** Format AU national numbers for display (02/03/07/08 landline, 04 mobile). */
export function formatAuNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
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
