import { Types } from 'mongoose';
import { CategoryModel } from './category.model';
import { ItemModel } from './item.model';
import { AppError } from '@utils/AppError';
import { toSlug } from '@utils/zod';
import { writeAuditLog } from '@modules/audit/audit.service';
import { emitMenuEvent } from './events';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
}

export interface CreateCategoryInput {
  name: string;
  slug?: string;
  description?: string;
  sortOrder?: number;
  translations?: Record<string, { name: string; description?: string }>;
}

async function nextSortOrder() {
  const last = await CategoryModel.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
  return (last?.sortOrder ?? -1) + 1;
}

async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await CategoryModel.findOne({ slug }).select('_id').lean();
    if (!existing || String(existing._id) === excludeId) return slug;
    slug = `${base}-${++i}`;
  }
}

export async function listCategories(opts: { includeInactive?: boolean } = {}) {
  const filter: Record<string, unknown> = {};
  if (!opts.includeInactive) filter.isActive = true;
  return CategoryModel.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
}

export async function getCategory(id: string) {
  const c = await CategoryModel.findById(id).lean();
  if (!c) throw AppError.notFound('Category not found');
  return c;
}

export async function createCategory(input: CreateCategoryInput, ctx: ActorCtx) {
  const baseSlug = input.slug ? toSlug(input.slug) : toSlug(input.name);
  const slug = await ensureUniqueSlug(baseSlug);
  const sortOrder = input.sortOrder ?? (await nextSortOrder());
  const cat = await CategoryModel.create({
    name: input.name,
    slug,
    description: input.description,
    sortOrder,
    translations: input.translations,
  });
  await writeAuditLog({
    ...ctx,
    action: 'category.create',
    entity: 'Category',
    entityId: String(cat._id),
    after: cat.toObject(),
  });
  emitMenuEvent('category:updated', { id: String(cat._id), action: 'create' });
  return cat.toObject();
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
  translations?: Record<string, { name: string; description?: string }>;
}

export async function updateCategory(id: string, input: UpdateCategoryInput, ctx: ActorCtx) {
  const cat = await CategoryModel.findById(id);
  if (!cat) throw AppError.notFound('Category not found');
  const before = cat.toObject();

  if (input.name !== undefined) cat.name = input.name;
  if (input.description !== undefined) cat.description = input.description;
  if (typeof input.isActive === 'boolean') cat.isActive = input.isActive;
  if (input.sortOrder !== undefined) cat.sortOrder = input.sortOrder;
  if (input.slug !== undefined) cat.slug = await ensureUniqueSlug(toSlug(input.slug), id);
  if (input.translations !== undefined) {
    cat.translations = new Map(Object.entries(input.translations));
  }
  await cat.save();

  await writeAuditLog({
    ...ctx,
    action: 'category.update',
    entity: 'Category',
    entityId: String(cat._id),
    before,
    after: cat.toObject(),
  });
  emitMenuEvent('category:updated', { id: String(cat._id), action: 'update' });
  return cat.toObject();
}

export async function deleteCategory(id: string, ctx: ActorCtx) {
  const cat = await CategoryModel.findById(id);
  if (!cat) throw AppError.notFound('Category not found');
  const itemCount = await ItemModel.countDocuments({ categoryId: cat._id });
  if (itemCount > 0) throw AppError.conflict(`Category has ${itemCount} item(s)`);
  await CategoryModel.deleteOne({ _id: cat._id });
  await writeAuditLog({
    ...ctx,
    action: 'category.delete',
    entity: 'Category',
    entityId: String(cat._id),
    before: cat.toObject(),
  });
  emitMenuEvent('category:updated', { id: String(cat._id), action: 'delete' });
}

export async function reorderCategories(order: string[], ctx: ActorCtx) {
  const ops = order.map((id, idx) => ({
    updateOne: { filter: { _id: new Types.ObjectId(id) }, update: { sortOrder: idx } },
  }));
  if (!ops.length) return;
  await CategoryModel.bulkWrite(ops);
  await writeAuditLog({
    ...ctx,
    action: 'category.reorder',
    entity: 'Category',
    metadata: { order },
  });
  emitMenuEvent('category:updated', { action: 'reorder' });
}
