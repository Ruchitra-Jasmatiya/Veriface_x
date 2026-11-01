// End-to-end API test.  Usage:  API=http://localhost:3001 ADMIN_PASSWORD=... node scripts/test-api.mjs
const BASE = process.env.API || 'http://localhost:3001';
const PASS = process.env.ADMIN_PASSWORD || 'admin123';
let cookie = ''; let fails = 0; let n = 0;
const cart = 'test_cart_' + Math.random().toString(36).slice(2, 12) + 'abcdef';
async function call(method, path, body, { admin = false, cartId = cart } = {}) {
  const h = { 'Content-Type': 'application/json', 'X-Cart-Id': cartId };
  if (admin) { h['X-Requested-With'] = 'fnf-admin'; h.Cookie = cookie; }
  const r = await fetch(BASE + '/api' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch { /* not json */ }
  return { s: r.status, j, h: r.headers };
}
const ok = (name, cond, extra = '') => { n++; if (!cond) { fails++; console.log('  ✗', name, extra); } else console.log('  ✓', name); };

console.log('Public catalog');
let r = await call('GET', '/catalog'); const v0 = r.j.version;
ok('catalog has products+categories', r.s === 200 && r.j.products.length >= 8 && r.j.categories.length >= 10);
ok('products carry legacy fields (image1/image2/category)', r.j.products[0].image1 && r.j.products[0].category);
const etag = r.h.get('etag'); r = await fetch(BASE + '/api/catalog', { headers: { 'If-None-Match': etag } });
ok('304 on unchanged version', r.status === 304);
r = await call('GET', '/products?category=Shahi%20Kulfi'); ok('filter by category name', r.j.products.length === 1 && r.j.products[0].name.includes('Pistachio'));
r = await call('GET', '/products?sort=low-high&veg=1&max=300'); ok('sort+filter', r.j.products.every((p, i, a) => i === 0 || a[i - 1].price <= p.price) && r.j.products.every((p) => p.price <= 300));
r = await call('GET', '/products?q=mango'); ok('search', r.j.total === 1);

console.log('Cart');
r = await call('GET', '/cart', null, { cartId: 'short' }); ok('rejects bad cart id', r.s === 400);
r = await call('POST', '/cart/items', { productId: 1, qty: 2 }); ok('add item', r.s === 200 && r.j.cart.count === 2 && r.j.cart.subtotal === 598, JSON.stringify(r.j));
r = await call('POST', '/cart/items', { productId: 1 }); ok('add again increments', r.j.cart.items[0].qty === 3);
r = await call('POST', '/cart/items', { productId: 2, qty: 1 });
r = await call('PATCH', '/cart/items/2', { qty: 4 }); ok('update qty', r.j.cart.items.find((i) => i.productId === 2).qty === 4);
r = await call('POST', '/cart/items', { productId: 9999 }); ok('unknown product 404', r.s === 404);
r = await call('GET', '/cart'); ok('cart persists', r.j.cart.count === 7 && r.j.cart.delivery === 0, `count=${r.j.cart.count} delivery=${r.j.cart.delivery}`);
r = await call('POST', '/cart/coupon', { code: 'nope' }); ok('bad coupon rejected', r.s === 400);
r = await call('POST', '/cart/coupon', { code: 'welcome10' }); ok('coupon applies (capped at ₹100)', r.s === 200 && r.j.cart.discount === 100, JSON.stringify(r.j.cart.coupon));
r = await call('DELETE', '/cart/items/2'); r = await call('PATCH', '/cart/items/1', { qty: 1 });
ok('totals recompute with delivery fee', r.j.cart.subtotal === 299 && r.j.cart.discount === 29.9 && r.j.cart.delivery === 40, JSON.stringify(r.j.cart));

console.log('Admin auth');
r = await call('GET', '/admin/stats', null, { admin: true }); ok('admin route blocked without login', r.s === 401);
r = await call('POST', '/admin/login', { password: 'wrong' }); ok('wrong password rejected', r.s === 401);
r = await call('POST', '/admin/login', { password: PASS }); ok('login ok + cookie set', r.s === 200 && cookie.startsWith('fnf_admin='));
r = await fetch(BASE + '/api/admin/products', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: '{}' }); ok('CSRF header required for writes', r.status === 403);
r = await call('GET', '/admin/session'); r = await fetch(BASE + '/api/admin/session', { headers: { Cookie: cookie } }); ok('session authenticated', (await r.json()).authenticated === true);

console.log('Admin: categories');
r = await call('POST', '/admin/categories', { name: 'Test Kulfi Corner', image: 'https://example.com/x.jpg' }, { admin: true }); ok('create category', r.s === 201); const catId = r.j.category?.id;
r = await call('POST', '/admin/categories', { name: 'test kulfi corner' }, { admin: true }); ok('duplicate category blocked', r.s === 409);
r = await call('POST', '/admin/categories', { name: 'Bad', image: 'javascript:alert(1)' }, { admin: true }); ok('javascript: image URL rejected', r.s === 400);

console.log('Admin: products (live reflect)');
const vBefore = (await call('GET', '/version')).j.v;
r = await call('POST', '/admin/products', { name: 'Test Choco Bar', price: 99, mrp: 129, categoryId: catId, stock: 3, ingredients: 'Milk\nCocoa, Sugar', image1: '/seed-images/c3.webp', vegetarian: true }, { admin: true });
ok('create product', r.s === 201 && r.j.product.discountPercent === 23, JSON.stringify(r.j)); const pid = r.j.product?.id;
ok('version bumped immediately', (await call('GET', '/version')).j.v > vBefore);
r = await call('GET', '/products?category=' + catId); ok('new product visible on storefront at once', r.j.products.length === 1 && r.j.products[0].name === 'Test Choco Bar' && r.j.products[0].ingredients.length === 3);
r = await call('POST', '/admin/products', { name: 'x', price: 1, categoryId: catId }, { admin: true }); ok('validation: short name', r.s === 400);
r = await call('POST', '/admin/products', { name: 'Valid', price: -5, categoryId: catId }, { admin: true }); ok('validation: negative price', r.s === 400);
r = await call('PATCH', '/admin/products/' + pid, { price: 89 }, { admin: true }); ok('quick price edit', r.j.product.price === 89);
r = await call('PATCH', '/admin/products/' + pid, { active: false }, { admin: true });
r = await call('GET', '/products?category=' + catId); ok('hidden product disappears from storefront', r.j.products.length === 0);
r = await call('PATCH', '/admin/products/' + pid, { active: true }, { admin: true });
r = await call('DELETE', '/admin/categories/' + catId, null, { admin: true }); ok('cannot delete category with products', r.s === 409);

console.log('Orders + stock');
const oc = 'order_cart_' + Math.random().toString(36).slice(2, 12) + 'abcdef';
r = await call('POST', '/cart/items', { productId: pid, qty: 5 }, { cartId: oc }); ok('cart clamps to stock (3)', r.j.cart.items[0].qty === 3 && r.j.cart.warnings.length > 0, JSON.stringify(r.j.cart));
r = await call('POST', '/orders', { name: 'A', phone: '1', address: 'x' }, { cartId: oc }); ok('order validation', r.s === 400 || r.s === 409);
r = await call('POST', '/orders', { name: 'Ruchitra J', phone: '+91 98765 43210', address: '12 MG Road, Mumbai', pincode: '400001' }, { cartId: oc }); ok('place order', r.s === 201 && /^FNF-\d+$/.test(r.j.order.number) && r.j.order.total === 307, JSON.stringify(r.j)); const order = r.j.order;
r = await call('GET', '/cart', null, { cartId: oc }); ok('cart cleared after order', r.j.cart.count === 0);
r = await call('GET', '/products/' + pid); ok('stock decremented to 0 -> inStock false', r.j.product.inStock === false && r.j.product.stock === 0);
r = await call('POST', '/cart/items', { productId: pid }, { cartId: oc }); ok('out-of-stock cannot be added', r.s === 409);
r = await call('GET', `/orders/track?number=${order.number}&phone=9876543210`); ok('customer order tracking', r.s === 200 && r.j.order.status === 'pending' && !r.j.order.customer.phone);
r = await call('GET', `/orders/track?number=${order.number}&phone=1111111111`); ok('tracking needs matching phone', r.s === 404);
r = await call('GET', '/admin/orders', null, { admin: true }); ok('admin sees order', r.j.orders[0].number === order.number);
r = await call('PATCH', '/admin/orders/' + order.id, { status: 'confirmed' }, { admin: true }); ok('status -> confirmed', r.j.order.status === 'confirmed');
r = await call('PATCH', '/admin/orders/' + order.id, { status: 'cancelled' }, { admin: true }); ok('cancel order', r.j.order.status === 'cancelled');
r = await call('GET', '/products/' + pid); ok('cancel restores stock', r.j.product.stock === 3);
r = await call('PATCH', '/admin/orders/' + order.id, { status: 'pending' }, { admin: true }); ok('cancelled cannot be re-opened', r.s === 409);

console.log('Coupons / settings / stats');
r = await call('POST', '/admin/coupons', { code: 'flat50', type: 'flat', value: 50, minOrder: 100 }, { admin: true }); ok('create coupon', r.s === 201 && r.j.coupon.code === 'FLAT50');
r = await call('POST', '/cart/coupon', { code: 'FLAT50' }); ok('new coupon usable instantly', r.s === 200 && r.j.cart.discount === 50);
r = await call('DELETE', '/admin/coupons/FLAT50', null, { admin: true }); ok('delete coupon', r.s === 200);
r = await call('PUT', '/admin/settings', { announcement: 'Diwali sale 🎉', deliveryFee: 25 }, { admin: true }); ok('update settings', r.j.settings.deliveryFee === 25);
r = await call('GET', '/catalog'); ok('announcement live on catalog', r.j.settings.announcement === 'Diwali sale 🎉');
r = await call('PUT', '/admin/settings', { announcement: 'x', acceptingOrders: false }, { admin: true });
r = await call('POST', '/cart/items', { productId: 1 }, { cartId: oc }); r = await call('POST', '/orders', { name: 'Ruchitra J', phone: '9876543210', address: 'Somewhere 12' }, { cartId: oc }); ok('orders blocked when store closed', r.s === 503);
r = await call('PUT', '/admin/settings', { acceptingOrders: true, announcement: '', deliveryFee: 40 }, { admin: true });
r = await call('GET', '/admin/stats?tz=330', null, { admin: true }); ok('stats', r.s === 200 && r.j.totals.products >= 9 && r.j.days.length === 7);
r = await call('POST', '/admin/password', { current: PASS, next: 'short' }, { admin: true }); ok('weak new password rejected', r.s === 400);

console.log('Cleanup');
r = await call('DELETE', '/admin/products/' + pid, null, { admin: true }); ok('delete product', r.s === 200);
r = await call('DELETE', '/admin/categories/' + catId, null, { admin: true }); ok('delete category', r.s === 200);
r = await call('DELETE', '/admin/orders/' + order.id, null, { admin: true }); ok('delete order', r.s === 200);
r = await call('POST', '/admin/logout', {}); r = await fetch(BASE + '/api/admin/stats', { headers: { Cookie: 'fnf_admin=' } }); ok('logged out -> 401', r.status === 401);

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
