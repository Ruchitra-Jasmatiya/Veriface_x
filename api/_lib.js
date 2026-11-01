import crypto from 'node:crypto';
import { list } from '@vercel/blob';

export const CATALOG_PATH = 'catalog.json';

export async function readCatalog() {
  const { blobs } = await list({ prefix: CATALOG_PATH });
  const b = blobs.find((x) => x.pathname === CATALOG_PATH);
  if (!b) return null;
  const r = await fetch(`${b.url}?t=${Date.now()}`);
  if (!r.ok) return null;
  return r.json();
}

export function isOwner(req) {
  const expected = process.env.ADMIN_PASSWORD || '';
  const given = String(req.headers['x-admin-password'] || '');
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

const clean = (s, n) => String(s ?? '').trim().slice(0, n);

// Only keep fields we know about, so a bad request can't store junk.
export function sanitizeCatalog(input) {
  const categories = (input?.categories || []).slice(0, 50).map((c) => ({
    id: clean(c.id, 40).toLowerCase().replace(/[^a-z0-9-]/g, ''),
    label: clean(c.label, 60),
  })).filter((c) => c.id && c.label);
  const ids = new Set(categories.map((c) => c.id));
  const products = (input?.products || []).slice(0, 1000).map((p) => ({
    id: clean(p.id, 40),
    name: clean(p.name, 100),
    category: clean(p.category, 40),
    price: Math.max(0, Number(p.price) || 0),
    img: clean(p.img, 500),
    sizes: Array.isArray(p.sizes) ? p.sizes.slice(0, 10).map((s) => clean(s, 6)) : ['L', 'XL', 'XXL'],
    isNew: !!p.isNew,
  })).filter((p) => p.id && p.img && ids.has(p.category));
  return { categories, products };
}
