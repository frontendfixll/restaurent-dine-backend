import { nextSeq } from '@modules/counters/counter.service';

function ymd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export async function nextOrderNumber(now = new Date()): Promise<string> {
  const key = `order:${ymd(now)}`;
  const seq = await nextSeq(key);
  return `${ymd(now)}-${String(seq).padStart(4, '0')}`;
}

export async function nextWindowToken(now = new Date()): Promise<string> {
  const key = `window:${ymd(now)}`;
  const seq = await nextSeq(key);
  return `T-${String(seq).padStart(3, '0')}`;
}
