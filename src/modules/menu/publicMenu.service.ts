import { CategoryModel } from './category.model';
import { ItemModel } from './item.model';
import { ModifierGroupModel } from './modifierGroup.model';
import { ComboModel } from './combo.model';
import { AvailabilityWindow } from './item.model';

function isWithinAvailability(windows: AvailabilityWindow[], now = new Date()): boolean {
  if (!windows.length) return true;
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return windows.some((w) => {
    if (!w.daysOfWeek.includes(day)) return false;
    const [sh, sm] = w.startTime.split(':').map(Number);
    const [eh, em] = w.endTime.split(':').map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (start <= end) return minutes >= start && minutes <= end;
    return minutes >= start || minutes <= end;
  });
}

function pickTranslated<T extends { name: string; description?: string }>(
  base: T,
  translations: Map<string, T> | Record<string, T> | undefined,
  lang: string,
): T {
  if (!translations || lang === 'en') return base;
  const t =
    translations instanceof Map
      ? translations.get(lang)
      : (translations as Record<string, T>)[lang];
  if (!t) return base;
  return { ...base, name: t.name || base.name, description: t.description ?? base.description };
}

export async function getPublicMenu(opts: { lang?: string; channel?: 'dine_in' | 'window' } = {}) {
  const lang = opts.lang ?? 'en';
  const now = new Date();

  const [categories, items, combos, modifierGroups] = await Promise.all([
    CategoryModel.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
    ItemModel.find({ isActive: true, is86: false }).sort({ sortOrder: 1, name: 1 }).lean(),
    ComboModel.find({ isActive: true, is86: false }).sort({ sortOrder: 1, name: 1 }).lean(),
    ModifierGroupModel.find({ isActive: true }).lean(),
  ]);

  const mgById = new Map(modifierGroups.map((g) => [String(g._id), g]));

  const itemsByCategory = new Map<string, unknown[]>();
  for (const item of items) {
    if (!isWithinAvailability(item.availabilityWindows, now)) continue;
    const visibleVariants = item.variants.filter((v) => !v.is86);
    const localized = pickTranslated(
      { name: item.name, description: item.description },
      item.translations as unknown as Record<string, { name: string; description?: string }>,
      lang,
    );
    const attachedGroups = item.modifierGroupIds
      .map((id) => mgById.get(String(id)))
      .filter(Boolean);

    const dto = {
      id: String(item._id),
      slug: item.slug,
      name: localized.name,
      description: localized.description,
      categoryId: String(item.categoryId),
      basePrice: item.basePrice,
      foodType: item.foodType,
      spiceLevel: item.spiceLevel,
      calories: item.calories,
      allergens: item.allergens,
      tags: item.tags,
      imageUrl: item.imageUrl,
      prepTimeMinutes: item.prepTimeMinutes,
      variants: visibleVariants.map((v) => ({
        id: String(v._id),
        name: v.name,
        priceDelta: v.priceDelta,
        absolutePrice: v.absolutePrice,
      })),
      modifierGroups: attachedGroups.map((g) => ({
        id: String(g!._id),
        name: g!.name,
        isRequired: g!.isRequired,
        minSelections: g!.minSelections,
        maxSelections: g!.maxSelections,
        modifiers: g!.modifiers
          .filter((m) => !m.is86)
          .map((m) => ({
            id: String(m._id),
            name: m.name,
            priceDelta: m.priceDelta,
            isDefault: m.isDefault,
          })),
      })),
    };
    const key = String(item.categoryId);
    const arr = itemsByCategory.get(key) ?? [];
    arr.push(dto);
    itemsByCategory.set(key, arr);
  }

  const categoryDtos = categories.map((c) => {
    const localized = pickTranslated(
      { name: c.name, description: c.description },
      c.translations as unknown as Record<string, { name: string; description?: string }>,
      lang,
    );
    return {
      id: String(c._id),
      slug: c.slug,
      name: localized.name,
      description: localized.description,
      iconUrl: c.iconUrl,
      sortOrder: c.sortOrder,
      items: itemsByCategory.get(String(c._id)) ?? [],
    };
  });

  const comboDtos = combos
    .filter((c) => isWithinAvailability(c.availabilityWindows, now))
    .map((c) => {
      const localized = pickTranslated(
        { name: c.name, description: c.description },
        c.translations as unknown as Record<string, { name: string; description?: string }>,
        lang,
      );
      return {
        id: String(c._id),
        slug: c.slug,
        name: localized.name,
        description: localized.description,
        price: c.price,
        imageUrl: c.imageUrl,
        items: c.items.map((ci) => ({
          itemId: String(ci.itemId),
          variantId: ci.variantId ? String(ci.variantId) : undefined,
          qty: ci.qty,
        })),
      };
    });

  return { lang, categories: categoryDtos, combos: comboDtos };
}
