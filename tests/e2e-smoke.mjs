// End-to-end smoke test against a live local server (port 4000).
// Run: node tests/e2e-smoke.mjs
const BASE = process.env.BASE || 'http://localhost:4000/api/v1';

async function http(method, path, { body, token, guest } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (guest) headers['X-Guest-Token'] = guest;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return parsed.data ?? parsed;
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

function log(emoji, ...args) {
  console.log(emoji, ...args);
}

(async () => {
  log('▶', 'staff login (owner)');
  const login = await http('POST', '/auth/staff/login', {
    body: { email: 'owner@smartdine.local', password: 'Owner@12345' },
  });
  assert(login.accessToken, 'no accessToken');
  const T = login.accessToken;
  log('  ', 'role:', login.user.role.key);

  log('▶', 'public menu (no auth)');
  const menu = await http('GET', '/menu/public');
  const starter = menu.categories[0].items[0];
  log('  ', menu.categories.length, 'categories, picked', starter.name);

  log('▶', 'find a table QR slug');
  const qrs = await http('GET', '/qr-codes?type=table', { token: T });
  const tableQr = qrs[0];
  log('  ', tableQr.label, 'slug=' + tableQr.slug);

  log('▶', 'place dine-in order via QR slug');
  const spiceGroup = starter.modifierGroups?.[0];
  const orderBody = {
    qrSlug: tableQr.slug,
    items: [
      {
        itemId: starter.id,
        ...(starter.variants[0] ? { variantId: starter.variants[0].id } : {}),
        qty: 2,
        ...(spiceGroup
          ? { modifiers: [{ groupId: spiceGroup.id, modifierId: spiceGroup.modifiers[0].id }] }
          : {}),
      },
    ],
    guestPhone: '+919812345678',
    guestName: 'Smoke Test',
  };
  const order = await http('POST', '/guest/orders/dine-in', { body: orderBody });
  log('  ', 'order', order.orderNumber, 'total ₹' + order.totals.grand);
  const orderId = order.id;
  const itemId = order.items[0].id;

  log('▶', 'staff accepts the order');
  await http('PATCH', `/orders/${orderId}/accept`, { token: T });

  log('▶', 'kitchen marks item ready (auto-bumps order)');
  await http('PATCH', `/kds/orders/${orderId}/items/${itemId}/status`, {
    token: T,
    body: { status: 'ready' },
  });

  log('▶', 'waiter serves');
  await http('POST', `/orders/${orderId}/serve`, { token: T });
  const served = await http('GET', `/orders/${orderId}`, { token: T });
  assert(served.status === 'served', 'expected served, got ' + served.status);

  log('▶', 'generate invoice');
  const invoice = await http('POST', `/billing/orders/${orderId}/bill`, {
    token: T,
    body: { customerName: 'Walk-in' },
  });
  log('  ', 'invoice', invoice.invoiceNumber, 'grand ₹' + invoice.grand);
  const invoiceId = invoice._id || invoice.id;

  log('▶', 'record cash payment for full amount');
  await http('POST', `/payments/invoices/${invoiceId}`, {
    token: T,
    body: { mode: 'cash', amount: invoice.grand, cashTendered: invoice.grand + 50 },
  });

  log('▶', 'order should now be settled and inventory deducted');
  const settled = await http('GET', `/orders/${orderId}`, { token: T });
  assert(settled.status === 'settled', 'expected settled, got ' + settled.status);

  log('▶', 'verify customer auto-created and credited');
  const cust = await http('POST', '/customers/lookup', {
    token: T,
    body: { phone: '+919812345678' },
  });
  assert(cust.visitCount >= 1, 'customer visit not counted');
  log('  ', 'customer LTV ₹' + cust.lifetimeValue, 'visits:', cust.visitCount);

  log('▶', 'verify low-stock or inventory movement recorded');
  const movements = await http('GET', `/inventory/movements?type=recipe_deduction`, { token: T });
  log('  ', movements.length, 'recipe_deduction movements logged');

  log('▶', 'KPI dashboard');
  const kpi = await http('GET', '/reports/kpi-dashboard', { token: T });
  log('  ', 'today orders:', kpi.today.orders, 'gross ₹' + kpi.today.gross);

  log('▶', 'tax report');
  const tax = await http('GET', '/reports/tax', { token: T });
  log('  ', 'tax invoices:', tax.summary.invoiceCount, 'total tax ₹' + tax.summary.totalTax);

  log('✅', 'all smoke checks passed');
})().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
