import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

/**
 * Flatten a structured report into one or more sheets and write a CSV/XLSX buffer.
 * For multi-section reports the first array-shaped value becomes the sheet.
 */
export function reportToCsv(report: Record<string, unknown>, sheetName = 'Report'): Buffer {
  const sheet = pickFirstArraySection(report);
  const ws = XLSX.utils.json_to_sheet(sheet);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'csv' }) as Buffer;
}

export function reportToXlsx(report: Record<string, unknown>, sheetName = 'Report'): Buffer {
  const sheets = pickAllArraySections(report);
  const wb = XLSX.utils.book_new();
  if (!sheets.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No data']]), sheetName);
  } else {
    for (const { name, rows } of sheets) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), safeSheetName(name));
    }
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export async function reportToPdf(
  title: string,
  report: Record<string, unknown>,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c as Buffer));
  const finished = new Promise<void>((resolve) => doc.on('end', () => resolve()));

  doc.font('Helvetica-Bold').fontSize(20).text(title);
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).fillColor('#666').text(`Generated ${new Date().toLocaleString()}`);
  doc.moveDown(0.8);

  const sections = pickAllArraySections(report);
  if (!sections.length) {
    doc.font('Helvetica').fontSize(11).fillColor('#000').text('No data for the selected range.');
  }
  for (const { name, rows } of sections) {
    if (!rows.length) continue;
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(name);
    doc.moveDown(0.3);
    const columns = Object.keys(rows[0]);
    const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / columns.length;
    doc.font('Helvetica-Bold').fontSize(9);
    const headerY = doc.y;
    columns.forEach((c, i) =>
      doc.text(c, doc.page.margins.left + i * colWidth, headerY, { width: colWidth, ellipsis: true }),
    );
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9);
    for (const row of rows.slice(0, 200)) {
      const y = doc.y;
      columns.forEach((c, i) =>
        doc.text(formatCell((row as Record<string, unknown>)[c]), doc.page.margins.left + i * colWidth, y, {
          width: colWidth,
          ellipsis: true,
        }),
      );
      doc.moveDown(0.15);
      if (doc.y > doc.page.height - 60) {
        doc.addPage();
      }
    }
    if (rows.length > 200) {
      doc.font('Helvetica-Oblique').fontSize(9).text(`(showing 200 of ${rows.length} rows)`);
    }
    doc.moveDown(0.6);
  }
  doc.end();
  await finished;
  return Buffer.concat(chunks);
}

function pickFirstArraySection(obj: Record<string, unknown>): Array<Record<string, unknown>> {
  for (const v of Object.values(obj)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
      return v as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function pickAllArraySections(
  obj: Record<string, unknown>,
): Array<{ name: string; rows: Array<Record<string, unknown>> }> {
  const out: Array<{ name: string; rows: Array<Record<string, unknown>> }> = [];
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
      out.push({ name: k, rows: v as Array<Record<string, unknown>> });
    }
  }
  return out;
}

function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
