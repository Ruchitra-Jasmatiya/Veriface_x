// Owner only (needs ADMIN_PASSWORD): check login, upload an image, save the catalog.
import { put, del } from '@vercel/blob';
import { CATALOG_PATH, isOwner, readCatalog, sanitizeCatalog } from './_lib.js';

const isBlobUrl = (u) => typeof u === 'string' && u.includes('.public.blob.vercel-storage.com/');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!isOwner(req)) return res.status(401).json({ error: 'Wrong password' });

  const { action } = req.body || {};
  try {
    if (action === 'login') return res.status(200).json({ ok: true });

    if (action === 'upload') {
      const m = /^data:image\/(webp|jpeg|png);base64,(.+)$/.exec(req.body.dataUrl || '');
      if (!m) return res.status(400).json({ error: 'Bad image' });
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 3 * 1024 * 1024) return res.status(400).json({ error: 'Image too big' });
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const blob = await put(`products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`, buf, {
        access: 'public',
        contentType: `image/${m[1]}`,
        addRandomSuffix: false,
        cacheControlMaxAge: 31536000,
      });
      return res.status(200).json({ url: blob.url });
    }

    if (action === 'save') {
      const next = sanitizeCatalog(req.body.catalog);
      const old = await readCatalog().catch(() => null);
      await put(CATALOG_PATH, JSON.stringify(next), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
      });
      // Remove uploaded images that are no longer used, to keep storage tidy.
      if (old?.products) {
        const keep = new Set(next.products.map((p) => p.img));
        const gone = old.products.map((p) => p.img).filter((u) => isBlobUrl(u) && !keep.has(u));
        if (gone.length) await del(gone).catch(() => {});
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
