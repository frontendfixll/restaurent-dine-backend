import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from './connect';
import { logger } from '@utils/logger';
import { config } from '@config/index';
import { RoleModel } from '@modules/roles/role.model';
import { UserModel } from '@modules/users/user.model';
import { BUILT_IN_ROLES } from '@modules/roles/builtInRoles';
import { hashPassword } from '@modules/auth/token.service';
import { RestaurantModel } from '@modules/restaurant/restaurant.model';
import { CategoryModel } from '@modules/menu/category.model';
import { ItemModel } from '@modules/menu/item.model';
import { ModifierGroupModel } from '@modules/menu/modifierGroup.model';
import { TableModel } from '@modules/tables/table.model';
import { QrCodeModel } from '@modules/qr/qrCode.model';
import { InventoryItemModel } from '@modules/inventory/inventoryItem.model';
import { RecipeModel } from '@modules/inventory/recipe.model';
import { ensureDefaultTemplates } from '@modules/notifications/template.service';
import crypto from 'crypto';

async function seedRoles() {
  for (const def of BUILT_IN_ROLES) {
    const existing = await RoleModel.findOne({ key: def.key });
    if (existing) {
      existing.name = def.name;
      existing.description = def.description;
      existing.permissions = def.permissions;
      existing.isSystem = def.isSystem;
      await existing.save();
      logger.info(`Updated built-in role: ${def.key}`);
    } else {
      await RoleModel.create(def);
      logger.info(`Created built-in role: ${def.key}`);
    }
  }
}

async function seedOwner() {
  const ownerRole = await RoleModel.findOne({ key: 'owner' });
  if (!ownerRole) throw new Error('Owner role missing — seedRoles must run first');
  const existing = await UserModel.findOne({ roleId: ownerRole._id });
  if (existing) {
    logger.info(`Owner already exists: ${existing.email}`);
    return;
  }
  const passwordHash = await hashPassword(config.seed.ownerPassword);
  const owner = await UserModel.create({
    email: config.seed.ownerEmail,
    passwordHash,
    name: config.seed.ownerName,
    roleId: ownerRole._id,
    isActive: true,
  });
  logger.info(`Seeded Owner: ${owner.email} / ${config.seed.ownerPassword}`);
}

async function seedRestaurant() {
  const existing = await RestaurantModel.findOne({ singleton: 'main' });
  if (existing) {
    logger.info(`Restaurant already exists: ${existing.brand.name}`);
    return;
  }
  const r = await RestaurantModel.create({ singleton: 'main' });
  logger.info(`Seeded Restaurant singleton: ${r.brand.name}`);
}

async function seedMenu() {
  if ((await CategoryModel.estimatedDocumentCount()) > 0) {
    logger.info('Menu already has data — skipping menu seed');
    return;
  }

  const [starters, mains, breads, beverages, desserts] = await CategoryModel.create([
    { name: 'Starters', slug: 'starters', sortOrder: 0 },
    { name: 'Main Course', slug: 'main-course', sortOrder: 1 },
    { name: 'Breads', slug: 'breads', sortOrder: 2 },
    { name: 'Beverages', slug: 'beverages', sortOrder: 3 },
    { name: 'Desserts', slug: 'desserts', sortOrder: 4 },
  ]);

  const spiceGroup = await ModifierGroupModel.create({
    name: 'Spice level',
    isRequired: true,
    minSelections: 1,
    maxSelections: 1,
    modifiers: [
      { name: 'Mild', priceDelta: 0, isDefault: true, is86: false },
      { name: 'Medium', priceDelta: 0, isDefault: false, is86: false },
      { name: 'Spicy', priceDelta: 0, isDefault: false, is86: false },
    ],
  });

  const extras = await ModifierGroupModel.create({
    name: 'Extras',
    isRequired: false,
    minSelections: 0,
    maxSelections: 3,
    modifiers: [
      { name: 'Extra cheese', priceDelta: 40, isDefault: false, is86: false },
      { name: 'Extra paneer', priceDelta: 60, isDefault: false, is86: false },
      { name: 'Avocado', priceDelta: 80, isDefault: false, is86: false },
    ],
  });

  await ItemModel.create([
    {
      name: 'Paneer Tikka',
      slug: 'paneer-tikka',
      description: 'Chargrilled marinated paneer cubes',
      categoryId: starters._id,
      basePrice: 280,
      prepTimeMinutes: 12,
      foodType: 'veg',
      spiceLevel: 2,
      allergens: ['dairy'],
      station: 'tandoor',
      modifierGroupIds: [spiceGroup._id, extras._id],
      variants: [{ name: 'Half', priceDelta: 0 }, { name: 'Full', priceDelta: 120 }],
    },
    {
      name: 'Chicken Tikka',
      slug: 'chicken-tikka',
      description: 'Boneless chicken marinated in yogurt and spices',
      categoryId: starters._id,
      basePrice: 340,
      prepTimeMinutes: 14,
      foodType: 'non_veg',
      spiceLevel: 3,
      station: 'tandoor',
      modifierGroupIds: [spiceGroup._id],
    },
    {
      name: 'Butter Chicken',
      slug: 'butter-chicken',
      description: 'Creamy tomato curry with tandoor-grilled chicken',
      categoryId: mains._id,
      basePrice: 420,
      prepTimeMinutes: 18,
      foodType: 'non_veg',
      spiceLevel: 2,
      allergens: ['dairy'],
      station: 'grill',
      modifierGroupIds: [spiceGroup._id],
    },
    {
      name: 'Paneer Butter Masala',
      slug: 'paneer-butter-masala',
      description: 'Cottage cheese in spiced tomato gravy',
      categoryId: mains._id,
      basePrice: 360,
      prepTimeMinutes: 16,
      foodType: 'veg',
      spiceLevel: 2,
      allergens: ['dairy'],
      station: 'grill',
      modifierGroupIds: [spiceGroup._id],
    },
    {
      name: 'Garlic Naan',
      slug: 'garlic-naan',
      categoryId: breads._id,
      basePrice: 80,
      prepTimeMinutes: 6,
      foodType: 'veg',
      allergens: ['gluten', 'dairy'],
      station: 'tandoor',
    },
    {
      name: 'Mango Lassi',
      slug: 'mango-lassi',
      categoryId: beverages._id,
      basePrice: 120,
      prepTimeMinutes: 4,
      foodType: 'veg',
      allergens: ['dairy'],
      station: 'beverages',
    },
    {
      name: 'Gulab Jamun',
      slug: 'gulab-jamun',
      description: 'Two pieces with chilled rabri',
      categoryId: desserts._id,
      basePrice: 140,
      prepTimeMinutes: 5,
      foodType: 'veg',
      allergens: ['dairy', 'gluten'],
      station: 'beverages',
    },
  ]);

  logger.info('Seeded menu: 5 categories, 2 modifier groups, 7 items');
}

function shortSlug(): string {
  return crypto
    .randomBytes(6)
    .toString('base64url')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 7);
}

async function seedTablesAndQr() {
  if ((await TableModel.estimatedDocumentCount()) > 0) {
    logger.info('Tables already exist — skipping tables/QR seed');
    return;
  }

  const tables = await TableModel.create([
    { number: 'AC-1', zone: 'AC', capacity: 4, sortOrder: 0 },
    { number: 'AC-2', zone: 'AC', capacity: 4, sortOrder: 1 },
    { number: 'AC-3', zone: 'AC', capacity: 2, sortOrder: 2 },
    { number: 'G-1', zone: 'Garden', capacity: 6, sortOrder: 3 },
    { number: 'G-2', zone: 'Garden', capacity: 6, sortOrder: 4 },
  ]);

  const tableQrs = tables.map((t) => ({
    type: 'table' as const,
    slug: shortSlug(),
    label: `Table ${t.number}`,
    tableId: t._id,
    style: 'plain' as const,
  }));

  const windowQr = {
    type: 'window' as const,
    slug: shortSlug(),
    label: 'Takeaway Window',
    style: 'branded' as const,
  };

  await QrCodeModel.create([...tableQrs, windowQr]);

  logger.info(`Seeded ${tables.length} tables + ${tableQrs.length + 1} QR codes`);
}

async function seedInventoryAndRecipes() {
  if ((await InventoryItemModel.estimatedDocumentCount()) > 0) {
    logger.info('Inventory already seeded — skipping');
    return;
  }

  const items = await InventoryItemModel.create([
    { name: 'Paneer', unit: 'kg', currentStock: 5, lowStockThreshold: 1, costPerUnit: 350 },
    { name: 'Chicken Boneless', unit: 'kg', currentStock: 8, lowStockThreshold: 2, costPerUnit: 280 },
    { name: 'Tomato', unit: 'kg', currentStock: 15, lowStockThreshold: 3, costPerUnit: 40 },
    { name: 'Onion', unit: 'kg', currentStock: 20, lowStockThreshold: 5, costPerUnit: 35 },
    { name: 'Flour (Maida)', unit: 'kg', currentStock: 25, lowStockThreshold: 5, costPerUnit: 45 },
    { name: 'Yogurt', unit: 'kg', currentStock: 6, lowStockThreshold: 1.5, costPerUnit: 80 },
    { name: 'Mango Pulp', unit: 'L', currentStock: 4, lowStockThreshold: 1, costPerUnit: 250 },
    { name: 'Butter', unit: 'kg', currentStock: 3, lowStockThreshold: 0.5, costPerUnit: 500 },
  ]);

  const inv: Record<string, (typeof items)[number]> = {};
  for (const i of items) inv[i.name] = i;

  const menuItems = await ItemModel.find({}).lean();
  const menuByName: Record<string, (typeof menuItems)[number]> = {};
  for (const m of menuItems) menuByName[m.name] = m;

  function variantId(menuItem: (typeof menuItems)[number] | undefined, vname: string) {
    return menuItem?.variants.find((v) => v.name === vname)?._id;
  }

  const recipes: Array<Record<string, unknown>> = [];
  const paneerTikka = menuByName['Paneer Tikka'];
  if (paneerTikka) {
    const half = variantId(paneerTikka, 'Half');
    const full = variantId(paneerTikka, 'Full');
    if (half)
      recipes.push({
        itemId: paneerTikka._id,
        variantId: half,
        ingredients: [
          { inventoryItemId: inv['Paneer']._id, qty: 0.15, unit: 'kg', optional: false },
          { inventoryItemId: inv['Yogurt']._id, qty: 0.05, unit: 'kg', optional: false },
        ],
      });
    if (full)
      recipes.push({
        itemId: paneerTikka._id,
        variantId: full,
        ingredients: [
          { inventoryItemId: inv['Paneer']._id, qty: 0.25, unit: 'kg', optional: false },
          { inventoryItemId: inv['Yogurt']._id, qty: 0.08, unit: 'kg', optional: false },
        ],
      });
  }
  if (menuByName['Chicken Tikka']) {
    recipes.push({
      itemId: menuByName['Chicken Tikka']._id,
      ingredients: [
        { inventoryItemId: inv['Chicken Boneless']._id, qty: 0.2, unit: 'kg', optional: false },
        { inventoryItemId: inv['Yogurt']._id, qty: 0.05, unit: 'kg', optional: false },
      ],
    });
  }
  if (menuByName['Butter Chicken']) {
    recipes.push({
      itemId: menuByName['Butter Chicken']._id,
      ingredients: [
        { inventoryItemId: inv['Chicken Boneless']._id, qty: 0.25, unit: 'kg', optional: false },
        { inventoryItemId: inv['Tomato']._id, qty: 0.2, unit: 'kg', optional: false },
        { inventoryItemId: inv['Butter']._id, qty: 0.03, unit: 'kg', optional: false },
        { inventoryItemId: inv['Yogurt']._id, qty: 0.05, unit: 'kg', optional: false },
      ],
    });
  }
  if (menuByName['Paneer Butter Masala']) {
    recipes.push({
      itemId: menuByName['Paneer Butter Masala']._id,
      ingredients: [
        { inventoryItemId: inv['Paneer']._id, qty: 0.2, unit: 'kg', optional: false },
        { inventoryItemId: inv['Tomato']._id, qty: 0.2, unit: 'kg', optional: false },
        { inventoryItemId: inv['Butter']._id, qty: 0.03, unit: 'kg', optional: false },
      ],
    });
  }
  if (menuByName['Garlic Naan']) {
    recipes.push({
      itemId: menuByName['Garlic Naan']._id,
      ingredients: [
        { inventoryItemId: inv['Flour (Maida)']._id, qty: 0.15, unit: 'kg', optional: false },
      ],
    });
  }
  if (menuByName['Mango Lassi']) {
    recipes.push({
      itemId: menuByName['Mango Lassi']._id,
      ingredients: [
        { inventoryItemId: inv['Mango Pulp']._id, qty: 0.1, unit: 'L', optional: false },
        { inventoryItemId: inv['Yogurt']._id, qty: 0.1, unit: 'kg', optional: false },
      ],
    });
  }

  if (recipes.length) await RecipeModel.create(recipes);
  logger.info(`Seeded inventory: ${items.length} raw materials + ${recipes.length} recipes`);
}

async function seedNotificationTemplates() {
  await ensureDefaultTemplates();
  logger.info('Notification templates ensured');
}

async function run() {
  await connectDatabase();
  logger.info(`Connected to db: ${mongoose.connection.name}`);
  await seedRoles();
  await seedOwner();
  await seedRestaurant();
  await seedMenu();
  await seedTablesAndQr();
  await seedInventoryAndRecipes();
  await seedNotificationTemplates();
  await disconnectDatabase();
  logger.info('Seed complete.');
}

run().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
