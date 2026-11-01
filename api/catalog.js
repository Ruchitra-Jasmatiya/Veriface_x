// Public: the shop page reads the product list from here.
import { readCatalog } from './_lib.js';

export default async function handler(req, res) {
  try {
    const data = await readCatalog();
    if (!data) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ empty: true });
    }
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=30');
    return res.status(200).json(data);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ empty: true });
  }
}
