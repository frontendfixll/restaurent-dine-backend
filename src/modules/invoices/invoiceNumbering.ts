import { nextSeq } from '@modules/counters/counter.service';

function fiscalYearLabel(d = new Date()): string {
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan
  // Indian fiscal year: April (3) → March
  if (month >= 3) {
    const yy = String(year).slice(-2);
    const yy2 = String(year + 1).slice(-2);
    return `${yy}-${yy2}`;
  }
  const yy = String(year - 1).slice(-2);
  const yy2 = String(year).slice(-2);
  return `${yy}-${yy2}`;
}

export async function nextInvoiceNumber(now = new Date()): Promise<string> {
  const fy = fiscalYearLabel(now);
  const seq = await nextSeq(`invoice:${fy}`);
  return `INV/${fy}/${String(seq).padStart(5, '0')}`;
}
