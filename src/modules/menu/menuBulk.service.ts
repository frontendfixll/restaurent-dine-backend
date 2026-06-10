import * as XLSX from 'xlsx';
import { ItemModel } from './item.model';
import { CategoryModel } from './category.model';
import { toSlug } from '@utils/zod';
import { writeAuditLog } from '@modules/audit/audit.service';
import { emitMenuEvent } from './events';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
}

interface ImportRow {
  name?: string;
  category_slug?: string;
  description?: string;
  base_price?: number | string;
  prep_time_minutes?: number | string;
  food_type?: string;
  spice_level?: number | string;
  calories?: number | string;
  hsn_code?: string;
  allergens?: string;
  station?: string;
  tags?: string;
}

const FOOD_TYPES = new Set(['veg', 'non_veg', 'egg', 'vegan']);

export interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  errors: Array<{ row: number; reason: string }>;
}

export async function importMenu(buffer: Buffer, ctx: ActorCtx): Promise<ImportSummary> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { total: 0, created: 0, updated: 0, errors: [] };
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: '' });

  let created = 0;
  let updated = 0;
  const errors: ImportSummary['errors'] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNo = i + 2;
    try {
      if (!row.name) throw new Error('Missing name');
      if (!row.category_slug) throw new Error('Missing category_slug');
      if (row.base_price === '' || row.base_price === undefined) throw new Error('Missing base_price');

      const category = await CategoryModel.findOne({ slug: String(row.category_slug).toLowerCase() });
      if (!category) throw new Error(`Category "${row.category_slug}" not found`);

      const foodType = String(row.food_type ?? 'veg').toLowerCase();
      if (!FOOD_TYPES.has(foodType)) throw new Error(`Invalid food_type: ${foodType}`);

      const slug = toSlug(String(row.name));
      const basePrice = Number(row.base_price);
      const allergens = row.allergens ? String(row.allergens).split(',').map((s) => s.trim()).filter(Boolean) : [];
      const tags = row.tags ? String(row.tags).split(',').map((s) => s.trim()).filter(Boolean) : [];

      const update = {
        name: String(row.name),
        description: row.description ? String(row.description) : undefined,
        categoryId: category._id,
        basePrice,
        prepTimeMinutes: row.prep_time_minutes !== '' ? Number(row.prep_time_minutes) : 10,
        foodType: foodType as 'veg' | 'non_veg' | 'egg' | 'vegan',
        spiceLevel: row.spice_level !== '' ? Number(row.spice_level) : 0,
        calories: row.calories !== '' ? Number(row.calories) : undefined,
        hsnCode: row.hsn_code ? String(row.hsn_code) : undefined,
        allergens,
        station: row.station ? String(row.station) : undefined,
        tags,
      };

      const existing = await ItemModel.findOne({ slug });
      if (existing) {
        existing.set(update);
        await existing.save();
        updated++;
      } else {
        await ItemModel.create({ ...update, slug });
        created++;
      }
    } catch (err) {
      errors.push({ row: lineNo, reason: (err as Error).message });
    }
  }

  await writeAuditLog({
    ...ctx,
    action: 'menu.import',
    entity: 'Item',
    metadata: { total: rows.length, created, updated, errors: errors.length },
  });
  emitMenuEvent('menu:updated', { action: 'import' });

  return { total: rows.length, created, updated, errors };
}

export async function exportMenu(): Promise<Buffer> {
  const items = await ItemModel.find().populate('categoryId', 'slug').lean();
  const rows = items.map((it) => ({
    name: it.name,
    category_slug: (it.categoryId as unknown as { slug: string } | null)?.slug ?? '',
    description: it.description ?? '',
    base_price: it.basePrice,
    prep_time_minutes: it.prepTimeMinutes,
    food_type: it.foodType,
    spice_level: it.spiceLevel,
    calories: it.calories ?? '',
    hsn_code: it.hsnCode ?? '',
    allergens: it.allergens.join(','),
    station: it.station ?? '',
    tags: it.tags.join(','),
    is_active: it.isActive,
    is_86: it.is86,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Items');
  return XLSX.write(wb, { type: 'buffer', bookType: 'csv' }) as Buffer;
}
