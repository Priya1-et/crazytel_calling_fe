export type MissedCallEntry = {
  id: string;
  phoneNumber: string;
  at: string;
};

const STORAGE_KEY = 'webcalling_missed_calls';

export function loadMissedCalls(): MissedCallEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MissedCallEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMissedCalls(entries: MissedCallEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function normalizeMissedNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}
