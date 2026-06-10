import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { config } from '@config/index';

export interface RenderContext {
  url: string;
  label: string;
  restaurantName?: string;
}

export async function renderPng(ctx: RenderContext): Promise<Buffer> {
  return QRCode.toBuffer(ctx.url, {
    type: 'png',
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 600,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}

export async function renderSvg(ctx: RenderContext): Promise<string> {
  return QRCode.toString(ctx.url, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 600,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}

export async function renderPdf(ctx: RenderContext): Promise<Buffer> {
  const png = await renderPng(ctx);
  const doc = new PDFDocument({ size: 'A5', margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk as Buffer));
  const finished = new Promise<void>((resolve) => doc.on('end', () => resolve()));

  if (ctx.restaurantName) {
    doc.fontSize(22).text(ctx.restaurantName, { align: 'center' });
    doc.moveDown(0.3);
  }
  doc.fontSize(36).text(ctx.label, { align: 'center' });
  doc.moveDown(0.6);
  const imageY = doc.y;
  const imageSize = 280;
  const imageX = doc.page.width / 2 - imageSize / 2;
  doc.image(png, imageX, imageY, { width: imageSize, height: imageSize });
  doc.y = imageY + imageSize + 16;
  doc.fontSize(14).fillColor('#444').text('Scan to order', { align: 'center' });
  doc.moveDown(0.3);
  doc
    .fontSize(9)
    .fillColor('#999')
    .text(`Powered by SmartDine · ${config.urls.publicBase}`, { align: 'center' });
  doc.end();

  await finished;
  return Buffer.concat(chunks);
}
