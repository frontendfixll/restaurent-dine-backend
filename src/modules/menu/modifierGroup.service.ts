import { ModifierGroupModel } from './modifierGroup.model';
import { ItemModel } from './item.model';
import { AppError } from '@utils/AppError';
import { writeAuditLog } from '@modules/audit/audit.service';
import { emitMenuEvent } from './events';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
}

export interface CreateModifierGroupInput {
  name: string;
  description?: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  modifiers: Array<{ name: string; priceDelta?: number; isDefault?: boolean }>;
}

export async function listModifierGroups() {
  return ModifierGroupModel.find().sort({ name: 1 }).lean();
}

export async function getModifierGroup(id: string) {
  const g = await ModifierGroupModel.findById(id).lean();
  if (!g) throw AppError.notFound('Modifier group not found');
  return g;
}

export async function createModifierGroup(input: CreateModifierGroupInput, ctx: ActorCtx) {
  const g = await ModifierGroupModel.create({
    name: input.name,
    description: input.description,
    isRequired: input.isRequired,
    minSelections: input.minSelections,
    maxSelections: input.maxSelections,
    modifiers: input.modifiers.map((m) => ({
      name: m.name,
      priceDelta: m.priceDelta ?? 0,
      isDefault: m.isDefault ?? false,
      is86: false,
    })),
  });
  await writeAuditLog({
    ...ctx,
    action: 'modifier_group.create',
    entity: 'ModifierGroup',
    entityId: String(g._id),
    after: g.toObject(),
  });
  emitMenuEvent('modifier_group:updated', { id: String(g._id), action: 'create' });
  return g.toObject();
}

export interface UpdateModifierGroupInput {
  name?: string;
  description?: string;
  isRequired?: boolean;
  minSelections?: number;
  maxSelections?: number;
  modifiers?: Array<{ name: string; priceDelta?: number; isDefault?: boolean; is86?: boolean }>;
  isActive?: boolean;
}

export async function updateModifierGroup(id: string, input: UpdateModifierGroupInput, ctx: ActorCtx) {
  const g = await ModifierGroupModel.findById(id);
  if (!g) throw AppError.notFound('Modifier group not found');
  const before = g.toObject();
  if (input.name !== undefined) g.name = input.name;
  if (input.description !== undefined) g.description = input.description;
  if (typeof input.isRequired === 'boolean') g.isRequired = input.isRequired;
  if (input.minSelections !== undefined) g.minSelections = input.minSelections;
  if (input.maxSelections !== undefined) g.maxSelections = input.maxSelections;
  if (typeof input.isActive === 'boolean') g.isActive = input.isActive;
  if (input.modifiers !== undefined) {
    g.set(
      'modifiers',
      input.modifiers.map((m) => ({
        name: m.name,
        priceDelta: m.priceDelta ?? 0,
        isDefault: m.isDefault ?? false,
        is86: m.is86 ?? false,
      })),
    );
  }
  await g.save();
  await writeAuditLog({
    ...ctx,
    action: 'modifier_group.update',
    entity: 'ModifierGroup',
    entityId: String(g._id),
    before,
    after: g.toObject(),
  });
  emitMenuEvent('modifier_group:updated', { id: String(g._id), action: 'update' });
  return g.toObject();
}

export async function deleteModifierGroup(id: string, ctx: ActorCtx) {
  const g = await ModifierGroupModel.findById(id);
  if (!g) throw AppError.notFound('Modifier group not found');
  const inUse = await ItemModel.countDocuments({ modifierGroupIds: g._id });
  if (inUse > 0) throw AppError.conflict(`Modifier group is attached to ${inUse} item(s)`);
  await ModifierGroupModel.deleteOne({ _id: g._id });
  await writeAuditLog({
    ...ctx,
    action: 'modifier_group.delete',
    entity: 'ModifierGroup',
    entityId: String(g._id),
    before: g.toObject(),
  });
  emitMenuEvent('modifier_group:updated', { id: String(g._id), action: 'delete' });
}
