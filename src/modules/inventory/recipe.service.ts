import { Types } from 'mongoose';
import { RecipeModel, RecipeIngredient } from './recipe.model';
import { InventoryItemModel } from './inventoryItem.model';
import { ItemModel } from '@modules/menu/item.model';
import { AppError } from '@utils/AppError';
import { writeAuditLog } from '@modules/audit/audit.service';
import { convert } from './units';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
}

export interface RecipeIngredientInput {
  inventoryItemId: string;
  qty: number;
  unit: 'kg' | 'g' | 'L' | 'ml' | 'pcs';
  optional?: boolean;
}

export interface CreateRecipeInput {
  itemId: string;
  variantId?: string;
  ingredients: RecipeIngredientInput[];
  notes?: string;
}

async function validateIngredients(ingredients: RecipeIngredientInput[]) {
  if (!ingredients.length) throw AppError.badRequest('Recipe needs at least one ingredient');
  const inventoryIds = ingredients.map((i) => i.inventoryItemId);
  const inventoryItems = await InventoryItemModel.find({ _id: { $in: inventoryIds } }).lean();
  const byId = new Map(inventoryItems.map((i) => [String(i._id), i]));
  for (const ing of ingredients) {
    const inv = byId.get(ing.inventoryItemId);
    if (!inv) throw AppError.badRequest(`Inventory item ${ing.inventoryItemId} not found`);
    try {
      convert(1, ing.unit, inv.unit);
    } catch {
      throw AppError.badRequest(
        `Ingredient "${inv.name}" uses unit ${ing.unit}, incompatible with ${inv.unit}`,
      );
    }
  }
}

export async function listRecipes(opts: { itemId?: string; page?: number; limit?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const filter: Record<string, unknown> = {};
  if (opts.itemId) filter.itemId = new Types.ObjectId(opts.itemId);
  const [items, total] = await Promise.all([
    RecipeModel.find(filter)
      .populate('itemId', 'name slug')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    RecipeModel.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getRecipe(id: string) {
  const r = await RecipeModel.findById(id).populate('itemId', 'name slug').lean();
  if (!r) throw AppError.notFound('Recipe not found');
  return r;
}

export async function createRecipe(input: CreateRecipeInput, ctx: ActorCtx) {
  const item = await ItemModel.findById(input.itemId);
  if (!item) throw AppError.badRequest('Item not found');
  if (input.variantId) {
    const variantExists = item.variants.some((v) => String(v._id) === input.variantId);
    if (!variantExists) throw AppError.badRequest('Variant not found on this item');
  }
  await validateIngredients(input.ingredients);

  const recipe = await RecipeModel.create({
    itemId: item._id,
    variantId: input.variantId ? new Types.ObjectId(input.variantId) : undefined,
    ingredients: input.ingredients.map((i) => ({
      inventoryItemId: new Types.ObjectId(i.inventoryItemId),
      qty: i.qty,
      unit: i.unit,
      optional: !!i.optional,
    })),
    notes: input.notes,
  }).catch((err) => {
    if (err && (err as { code?: number }).code === 11000) {
      throw AppError.conflict('A recipe for this item/variant already exists');
    }
    throw err;
  });

  await writeAuditLog({
    ...ctx,
    action: 'recipe.create',
    entity: 'Recipe',
    entityId: String(recipe._id),
    after: recipe.toObject(),
  });
  return recipe.toObject();
}

export interface UpdateRecipeInput {
  ingredients?: RecipeIngredientInput[];
  notes?: string;
  isActive?: boolean;
}

export async function updateRecipe(id: string, input: UpdateRecipeInput, ctx: ActorCtx) {
  const recipe = await RecipeModel.findById(id);
  if (!recipe) throw AppError.notFound('Recipe not found');
  const before = recipe.toObject();
  if (input.ingredients) {
    await validateIngredients(input.ingredients);
    recipe.set(
      'ingredients',
      input.ingredients.map((i) => ({
        inventoryItemId: new Types.ObjectId(i.inventoryItemId),
        qty: i.qty,
        unit: i.unit,
        optional: !!i.optional,
      })),
    );
  }
  if (input.notes !== undefined) recipe.notes = input.notes;
  if (typeof input.isActive === 'boolean') recipe.isActive = input.isActive;
  await recipe.save();
  await writeAuditLog({
    ...ctx,
    action: 'recipe.update',
    entity: 'Recipe',
    entityId: String(recipe._id),
    before,
    after: recipe.toObject(),
  });
  return recipe.toObject();
}

export async function deleteRecipe(id: string, ctx: ActorCtx) {
  const recipe = await RecipeModel.findById(id);
  if (!recipe) throw AppError.notFound('Recipe not found');
  await RecipeModel.deleteOne({ _id: recipe._id });
  await writeAuditLog({
    ...ctx,
    action: 'recipe.delete',
    entity: 'Recipe',
    entityId: String(recipe._id),
    before: recipe.toObject(),
  });
}

export async function findRecipeFor(
  itemId: Types.ObjectId,
  variantId?: Types.ObjectId,
): Promise<RecipeIngredient[] | null> {
  // Prefer variant-specific recipe; fall back to item-level recipe.
  if (variantId) {
    const specific = await RecipeModel.findOne({ itemId, variantId, isActive: true }).lean();
    if (specific) return specific.ingredients;
  }
  const generic = await RecipeModel.findOne({
    itemId,
    variantId: { $exists: false },
    isActive: true,
  }).lean();
  return generic?.ingredients ?? null;
}
