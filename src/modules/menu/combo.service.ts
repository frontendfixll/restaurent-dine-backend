import { Types } from 'mongoose';
import { ComboModel } from './combo.model';
import { ItemModel } from './item.model';
import { AppError } from '@utils/AppError';
import { toSlug } from '@utils/zod';
import { writeAuditLog } from '@modules/audit/audit.service';
import { emitMenuEvent } from './events';
import { uploadBuffer, deleteResource } from '@providers/cloudinary.provider';
import { config } from '@config/index';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
}

async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await ComboModel.findOne({ slug }).select('_id').lean();
    if (!existing || String(existing._id) === excludeId) return slug;
    slug = `${base}-${++i}`;
  }
}

async function ensureItemsExist(itemIds: string[]) {
  if (!itemIds.length) return;
  const count = await ItemModel.countDocuments({ _id: { $in: itemIds } });
  if (count !== itemIds.length) throw AppError.badRequest('One or more combo items not found');
}

export interface CreateComboInput {
  name: string;
  slug?: string;
  description?: string;
  price: number;
  items: Array<{ itemId: string; variantId?: string; qty: number }>;
  modifierGroupIds?: string[];
  availabilityWindows?: Array<{ daysOfWeek: number[]; startTime: string; endTime: string }>;
  translations?: Record<string, { name: string; description?: string }>;
  sortOrder?: number;
}

export async function listCombos() {
  return ComboModel.find().sort({ sortOrder: 1, name: 1 }).lean();
}

export async function getCombo(id: string) {
  const c = await ComboModel.findById(id).lean();
  if (!c) throw AppError.notFound('Combo not found');
  return c;
}

export async function createCombo(input: CreateComboInput, ctx: ActorCtx) {
  await ensureItemsExist(input.items.map((i) => i.itemId));
  const baseSlug = input.slug ? toSlug(input.slug) : toSlug(input.name);
  const slug = await ensureUniqueSlug(baseSlug);
  const c = await ComboModel.create({
    name: input.name,
    slug,
    description: input.description,
    price: input.price,
    items: input.items.map((i) => ({
      itemId: new Types.ObjectId(i.itemId),
      variantId: i.variantId ? new Types.ObjectId(i.variantId) : undefined,
      qty: i.qty,
    })),
    modifierGroupIds: input.modifierGroupIds?.map((id) => new Types.ObjectId(id)) ?? [],
    availabilityWindows: input.availabilityWindows ?? [],
    translations: input.translations,
    sortOrder: input.sortOrder ?? 0,
  });
  await writeAuditLog({
    ...ctx,
    action: 'combo.create',
    entity: 'Combo',
    entityId: String(c._id),
    after: c.toObject(),
  });
  emitMenuEvent('combo:updated', { id: String(c._id), action: 'create' });
  return c.toObject();
}

export interface UpdateComboInput extends Partial<CreateComboInput> {
  isActive?: boolean;
}

export async function updateCombo(id: string, input: UpdateComboInput, ctx: ActorCtx) {
  const c = await ComboModel.findById(id);
  if (!c) throw AppError.notFound('Combo not found');
  const before = c.toObject();

  if (input.items) {
    await ensureItemsExist(input.items.map((i) => i.itemId));
    c.set(
      'items',
      input.items.map((i) => ({
        itemId: new Types.ObjectId(i.itemId),
        variantId: i.variantId ? new Types.ObjectId(i.variantId) : undefined,
        qty: i.qty,
      })),
    );
  }
  if (input.slug !== undefined) c.slug = await ensureUniqueSlug(toSlug(input.slug), id);
  if (input.name !== undefined) c.name = input.name;
  if (input.description !== undefined) c.description = input.description;
  if (input.price !== undefined) c.price = input.price;
  if (input.modifierGroupIds !== undefined) {
    c.modifierGroupIds = input.modifierGroupIds.map((m) => new Types.ObjectId(m));
  }
  if (input.availabilityWindows !== undefined) c.set('availabilityWindows', input.availabilityWindows);
  if (input.translations !== undefined) c.translations = new Map(Object.entries(input.translations));
  if (input.sortOrder !== undefined) c.sortOrder = input.sortOrder;
  if (typeof input.isActive === 'boolean') c.isActive = input.isActive;

  await c.save();
  await writeAuditLog({
    ...ctx,
    action: 'combo.update',
    entity: 'Combo',
    entityId: String(c._id),
    before,
    after: c.toObject(),
  });
  emitMenuEvent('combo:updated', { id: String(c._id), action: 'update' });
  return c.toObject();
}

export async function toggleCombo86(id: string, is86: boolean, ctx: ActorCtx) {
  const c = await ComboModel.findById(id);
  if (!c) throw AppError.notFound('Combo not found');
  c.is86 = is86;
  await c.save();
  await writeAuditLog({
    ...ctx,
    action: 'combo.86',
    entity: 'Combo',
    entityId: String(c._id),
    metadata: { is86 },
  });
  emitMenuEvent('combo:86_changed', { id: String(c._id), is86 });
  return c.toObject();
}

export async function uploadComboImage(id: string, buffer: Buffer, filename: string, ctx: ActorCtx) {
  if (!config.cloudinary.enabled) throw new AppError('SERVICE_UNAVAILABLE', 'Cloudinary not configured');
  const c = await ComboModel.findById(id);
  if (!c) throw AppError.notFound('Combo not found');
  const previousPublicId = c.imagePublicId;
  const { url, publicId } = await uploadBuffer(buffer, {
    folder: `${config.cloudinary.folder}/combos`,
    publicId: `${c.slug}-${Date.now()}`,
  });
  c.imageUrl = url;
  c.imagePublicId = publicId;
  await c.save();
  if (previousPublicId && previousPublicId !== publicId) {
    deleteResource(previousPublicId).catch(() => undefined);
  }
  await writeAuditLog({
    ...ctx,
    action: 'combo.image.upload',
    entity: 'Combo',
    entityId: String(c._id),
    metadata: { filename, publicId },
  });
  emitMenuEvent('combo:updated', { id: String(c._id), action: 'image' });
  return { imageUrl: url, imagePublicId: publicId };
}

export async function deleteCombo(id: string, ctx: ActorCtx) {
  const c = await ComboModel.findById(id);
  if (!c) throw AppError.notFound('Combo not found');
  await ComboModel.deleteOne({ _id: c._id });
  if (c.imagePublicId) deleteResource(c.imagePublicId).catch(() => undefined);
  await writeAuditLog({
    ...ctx,
    action: 'combo.delete',
    entity: 'Combo',
    entityId: String(c._id),
    before: c.toObject(),
  });
  emitMenuEvent('combo:updated', { id: String(c._id), action: 'delete' });
}
