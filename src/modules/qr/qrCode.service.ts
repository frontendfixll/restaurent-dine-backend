import crypto from 'crypto';
import { Types } from 'mongoose';
import { QrCodeModel } from './qrCode.model';
import { TableModel } from '@modules/tables/table.model';
import { AppError } from '@utils/AppError';
import { writeAuditLog } from '@modules/audit/audit.service';
import { config } from '@config/index';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
}

function generateSlug(len = 7): string {
  return crypto
    .randomBytes(8)
    .toString('base64url')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, len);
}

async function uniqueSlug(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const s = generateSlug();
    const dup = await QrCodeModel.findOne({ slug: s }).select('_id').lean();
    if (!dup) return s;
  }
  throw AppError.internal('Could not generate unique slug');
}

export function targetUrlFor(qr: { type: 'table' | 'window'; slug: string }): string {
  const base = config.urls.publicBase.replace(/\/+$/, '');
  return `${base}/r/${qr.slug}`;
}

export function resolveScanRedirect(qr: {
  type: 'table' | 'window';
  slug: string;
  tableId?: Types.ObjectId;
}): string {
  const base = config.urls.guestApp.replace(/\/+$/, '');
  if (qr.type === 'table') {
    return `${base}/order?qr=${qr.slug}&table=${qr.tableId ?? ''}`;
  }
  return `${base}/window?qr=${qr.slug}`;
}

export interface CreateQrInput {
  type: 'table' | 'window';
  tableId?: string;
  label: string;
  style?: 'plain' | 'branded' | 'designed';
}

export async function listQrCodes(opts: { type?: 'table' | 'window'; tableId?: string } = {}) {
  const filter: Record<string, unknown> = {};
  if (opts.type) filter.type = opts.type;
  if (opts.tableId) filter.tableId = new Types.ObjectId(opts.tableId);
  return QrCodeModel.find(filter).sort({ createdAt: -1 }).lean();
}

export async function getQr(id: string) {
  const qr = await QrCodeModel.findById(id).lean();
  if (!qr) throw AppError.notFound('QR code not found');
  return qr;
}

export async function getQrBySlug(slug: string) {
  return QrCodeModel.findOne({ slug, isActive: true });
}

export async function createQr(input: CreateQrInput, ctx: ActorCtx) {
  if (input.type === 'table') {
    if (!input.tableId) throw AppError.badRequest('tableId is required for table QR');
    const table = await TableModel.findById(input.tableId);
    if (!table) throw AppError.badRequest('Table not found');
  }
  const slug = await uniqueSlug();
  const qr = await QrCodeModel.create({
    type: input.type,
    label: input.label,
    tableId: input.tableId ? new Types.ObjectId(input.tableId) : undefined,
    slug,
    style: input.style ?? 'plain',
  });
  await writeAuditLog({
    ...ctx,
    action: 'qr.create',
    entity: 'QrCode',
    entityId: String(qr._id),
    after: qr.toObject(),
  });
  return qr.toObject();
}

export interface BulkQrInput {
  tableIds: string[];
  style?: 'plain' | 'branded' | 'designed';
}

export async function bulkCreateForTables(input: BulkQrInput, ctx: ActorCtx) {
  const tables = await TableModel.find({ _id: { $in: input.tableIds } });
  if (tables.length !== input.tableIds.length) throw AppError.badRequest('One or more tables not found');
  const created: unknown[] = [];
  for (const t of tables) {
    const existing = await QrCodeModel.findOne({ type: 'table', tableId: t._id }).lean();
    if (existing) continue;
    const slug = await uniqueSlug();
    const qr = await QrCodeModel.create({
      type: 'table',
      label: `Table ${t.number}`,
      tableId: t._id,
      slug,
      style: input.style ?? 'plain',
    });
    created.push(qr.toObject());
  }
  await writeAuditLog({
    ...ctx,
    action: 'qr.bulk_create',
    entity: 'QrCode',
    metadata: { tableIds: input.tableIds, created: created.length },
  });
  return { created: created.length, qrCodes: created };
}

export async function updateQr(
  id: string,
  input: { label?: string; style?: 'plain' | 'branded' | 'designed'; isActive?: boolean },
  ctx: ActorCtx,
) {
  const qr = await QrCodeModel.findById(id);
  if (!qr) throw AppError.notFound('QR code not found');
  const before = qr.toObject();
  if (input.label !== undefined) qr.label = input.label;
  if (input.style !== undefined) qr.style = input.style;
  if (typeof input.isActive === 'boolean') qr.isActive = input.isActive;
  await qr.save();
  await writeAuditLog({
    ...ctx,
    action: 'qr.update',
    entity: 'QrCode',
    entityId: String(qr._id),
    before,
    after: qr.toObject(),
  });
  return qr.toObject();
}

export async function regenerateSlug(id: string, ctx: ActorCtx) {
  const qr = await QrCodeModel.findById(id);
  if (!qr) throw AppError.notFound('QR code not found');
  const oldSlug = qr.slug;
  qr.slug = await uniqueSlug();
  await qr.save();
  await writeAuditLog({
    ...ctx,
    action: 'qr.regenerate',
    entity: 'QrCode',
    entityId: String(qr._id),
    metadata: { oldSlug, newSlug: qr.slug },
  });
  return qr.toObject();
}

export async function deleteQr(id: string, ctx: ActorCtx) {
  const qr = await QrCodeModel.findById(id);
  if (!qr) throw AppError.notFound('QR code not found');
  await QrCodeModel.deleteOne({ _id: qr._id });
  await writeAuditLog({
    ...ctx,
    action: 'qr.delete',
    entity: 'QrCode',
    entityId: String(qr._id),
    before: qr.toObject(),
  });
}

export async function getAnalytics(id: string) {
  const qr = await QrCodeModel.findById(id).lean();
  if (!qr) throw AppError.notFound('QR code not found');
  const avgBill = qr.analytics.orders > 0 ? qr.analytics.revenue / qr.analytics.orders : 0;
  const conversionRate = qr.analytics.scans > 0 ? qr.analytics.orders / qr.analytics.scans : 0;
  return {
    qrId: String(qr._id),
    label: qr.label,
    scans: qr.analytics.scans,
    orders: qr.analytics.orders,
    revenue: qr.analytics.revenue,
    averageBill: Math.round(avgBill * 100) / 100,
    conversionRate: Math.round(conversionRate * 1000) / 1000,
    abandonmentRate: Math.round((1 - conversionRate) * 1000) / 1000,
    lastScanAt: qr.analytics.lastScanAt,
  };
}

export async function recordScan(slug: string) {
  return QrCodeModel.findOneAndUpdate(
    { slug, isActive: true },
    { $inc: { 'analytics.scans': 1 }, $set: { 'analytics.lastScanAt': new Date() } },
    { new: true },
  );
}

export async function recordOrderAttribution(qrId: Types.ObjectId, revenue: number) {
  await QrCodeModel.updateOne(
    { _id: qrId },
    { $inc: { 'analytics.orders': 1, 'analytics.revenue': revenue } },
  );
}
