import PDFDocument from 'pdfkit';
import { InvoiceDocument } from './invoice.model';

const FONT_SIZE = { brand: 18, header: 11, body: 10, small: 8, grand: 14 };

function inr(n: number): string {
  return `₹${n.toFixed(2)}`;
}

export async function generateInvoicePdf(invoice: InvoiceDocument): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A5', margin: 28 });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c as Buffer));
  const finished = new Promise<void>((resolve) => doc.on('end', () => resolve()));

  const r = invoice.restaurantSnapshot;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // === Header ===
  doc.font('Helvetica-Bold').fontSize(FONT_SIZE.brand).text(r.name, { align: 'center' });
  if (r.address) doc.font('Helvetica').fontSize(FONT_SIZE.small).text(r.address, { align: 'center' });
  if (r.contactPhone) doc.fontSize(FONT_SIZE.small).text(`Phone: ${r.contactPhone}`, { align: 'center' });
  if (r.gstin) doc.fontSize(FONT_SIZE.small).text(`GSTIN: ${r.gstin}`, { align: 'center' });
  if (r.fssai) doc.fontSize(FONT_SIZE.small).text(`FSSAI: ${r.fssai}`, { align: 'center' });
  for (const line of r.headerLines) doc.fontSize(FONT_SIZE.small).text(line, { align: 'center' });
  doc.moveDown(0.5);
  hr(doc);

  // === Invoice meta ===
  doc.font('Helvetica-Bold').fontSize(FONT_SIZE.header).text('TAX INVOICE', { align: 'center' });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(FONT_SIZE.body);
  const leftCol = doc.page.margins.left;
  const rightCol = leftCol + w / 2;
  const metaY = doc.y;
  doc.text(`Invoice #: ${invoice.invoiceNumber}`, leftCol, metaY);
  doc.text(`Order #: ${invoice.orderNumberSnapshot}`, leftCol, metaY + 14);
  doc.text(`Date: ${invoice.issueDate.toLocaleString('en-IN')}`, leftCol, metaY + 28);
  if (invoice.tableNumber) doc.text(`Table: ${invoice.tableNumber}`, leftCol, metaY + 42);
  doc.text(`Channel: ${invoice.channel}`, rightCol, metaY);
  if (invoice.cashierName) doc.text(`Cashier: ${invoice.cashierName}`, rightCol, metaY + 14);
  if (invoice.customerName) doc.text(`Customer: ${invoice.customerName}`, rightCol, metaY + 28);
  if (invoice.customerPhone) doc.text(`Phone: ${invoice.customerPhone}`, rightCol, metaY + 42);
  if (invoice.customerGstin) doc.text(`Cust. GSTIN: ${invoice.customerGstin}`, rightCol, metaY + 56);
  doc.y = metaY + 70;
  hr(doc);

  // === Line items table ===
  doc.moveDown(0.2);
  doc.font('Helvetica-Bold').fontSize(FONT_SIZE.body);
  const colNameX = leftCol;
  const colQtyX = leftCol + w * 0.55;
  const colRateX = leftCol + w * 0.7;
  const colAmountX = leftCol + w * 0.85;
  const tableHeaderY = doc.y;
  doc.text('Item', colNameX, tableHeaderY, { width: w * 0.55 });
  doc.text('Qty', colQtyX, tableHeaderY, { width: w * 0.1, align: 'right' });
  doc.text('Rate', colRateX, tableHeaderY, { width: w * 0.15, align: 'right' });
  doc.text('Amount', colAmountX, tableHeaderY, { width: w * 0.15, align: 'right' });
  doc.y = tableHeaderY + 14;
  hr(doc, 0.5);

  doc.font('Helvetica').fontSize(FONT_SIZE.body);
  for (const li of invoice.lineItems) {
    const rowY = doc.y;
    const nameWithVariant = li.variantName ? `${li.name} (${li.variantName})` : li.name;
    doc.text(nameWithVariant, colNameX, rowY, { width: w * 0.55 });
    doc.text(String(li.qty), colQtyX, rowY, { width: w * 0.1, align: 'right' });
    doc.text(inr(li.unitPrice), colRateX, rowY, { width: w * 0.15, align: 'right' });
    doc.text(inr(li.lineTotal), colAmountX, rowY, { width: w * 0.15, align: 'right' });
    doc.y = rowY + Math.max(14, doc.heightOfString(nameWithVariant, { width: w * 0.55 }));
  }
  hr(doc, 0.5);
  doc.moveDown(0.2);

  // === Totals ===
  doc.font('Helvetica').fontSize(FONT_SIZE.body);
  totalLine(doc, w, 'Subtotal', inr(invoice.subtotal + invoice.modifierTotal));
  if (invoice.discount > 0) totalLine(doc, w, 'Discount', `- ${inr(invoice.discount)}`);
  if (invoice.serviceCharge > 0) totalLine(doc, w, 'Service Charge', inr(invoice.serviceCharge));
  for (const t of invoice.taxBreakup) {
    if (t.amount > 0) totalLine(doc, w, `${t.name} @${t.rate}%`, inr(t.amount));
  }
  if (invoice.roundOff !== 0) totalLine(doc, w, 'Round-off', inr(invoice.roundOff));
  doc.moveDown(0.2);
  hr(doc);

  doc.font('Helvetica-Bold').fontSize(FONT_SIZE.grand);
  const grandY = doc.y;
  doc.text('GRAND TOTAL', leftCol, grandY);
  doc.text(inr(invoice.grand), leftCol, grandY, { width: w, align: 'right' });
  doc.y = grandY + 18;

  doc.font('Helvetica-Oblique').fontSize(FONT_SIZE.small).text(invoice.amountInWords, leftCol, doc.y, {
    width: w,
  });
  doc.moveDown(0.4);
  hr(doc);

  // === Payments summary ===
  doc.font('Helvetica').fontSize(FONT_SIZE.body);
  totalLine(doc, w, 'Paid', inr(invoice.amountPaid));
  totalLine(doc, w, 'Due', inr(invoice.amountDue));
  totalLine(doc, w, 'Status', invoice.paymentStatus.toUpperCase());
  doc.moveDown(0.3);

  // === Splits (if any) ===
  if (invoice.splits.length) {
    hr(doc, 0.5);
    doc.font('Helvetica-Bold').fontSize(FONT_SIZE.body).text('Bill Split');
    doc.font('Helvetica').fontSize(FONT_SIZE.body);
    for (const s of invoice.splits) {
      totalLine(doc, w, `${s.label} — ${s.status}`, inr(s.amount));
    }
    doc.moveDown(0.3);
  }

  // === Footer ===
  hr(doc);
  doc.font('Helvetica').fontSize(FONT_SIZE.small);
  for (const line of r.footerLines) doc.text(line, { align: 'center' });
  doc.text('Powered by SmartDine', { align: 'center' });

  doc.end();
  await finished;
  return Buffer.concat(chunks);
}

function hr(doc: PDFKit.PDFDocument, weight = 1) {
  const x1 = doc.page.margins.left;
  const x2 = doc.page.width - doc.page.margins.right;
  doc.moveTo(x1, doc.y).lineTo(x2, doc.y).lineWidth(weight).strokeColor('#cccccc').stroke();
  doc.moveDown(0.2);
}

function totalLine(doc: PDFKit.PDFDocument, w: number, label: string, value: string) {
  const y = doc.y;
  doc.text(label, doc.page.margins.left, y);
  doc.text(value, doc.page.margins.left, y, { width: w, align: 'right' });
  doc.y = y + 14;
}
