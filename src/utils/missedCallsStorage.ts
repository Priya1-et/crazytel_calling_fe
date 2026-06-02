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

/** Merge API missed logs with localStorage entries (by phone, newest first). */
export function mergeMissedCalls(
  local: MissedCallEntry[],
  apiRows: Array<{ phoneNumber: string; startTime: string }>,
): MissedCallEntry[] {
  const byPhone = new Map<string, MissedCallEntry>();
  for (const row of apiRows) {
    const phoneNumber = normalizeMissedNumber(row.phoneNumber);
    if (!phoneNumber) continue;
    byPhone.set(phoneNumber, {
      id: `api-${phoneNumber}-${row.startTime}`,
      phoneNumber,
      at: row.startTime,
    });
  }
  for (const entry of local) {
    if (!byPhone.has(entry.phoneNumber)) {
      byPhone.set(entry.phoneNumber, entry);
    }
  }
  return [...byPhone.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
