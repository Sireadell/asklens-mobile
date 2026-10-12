const dayOf = (t: number) => {
  const d = new Date(t);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
};

// Consecutive days (ending today, or yesterday if nothing today) that have a saved proof.
// includeToday: count today as done, used while saving a new proof.
export function streakFrom(receipts: { savedAt: number }[], now: number, includeToday = false): number {
  const days = new Set(receipts.map((r) => dayOf(r.savedAt)));
  const today = dayOf(now);
  if (includeToday) days.add(today);
  let d = days.has(today) ? today : today - 1;
  let n = 0;
  while (days.has(d)) {
    n++;
    d--;
  }
  return n;
}

