import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { SEED } from '../../server/seed.js';

/**
 * One place for everything that comes from the backend:
 *   - products / categories / settings  (kept LIVE: when you change something in /admin the site updates
 *     within a few seconds everywhere, and instantly in the same browser)
 *   - the shopping cart (stored on the server, so it survives refreshes and works across tabs)
 */
const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

const POLL_MS = 4000;       // how often an active visitor checks for admin changes (tiny request)
const IDLE_POLL_MS = 20000; // after 3 min without interaction
let bc = null;
try { bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('fnf-sync') : null; } catch { bc = null; }

function offlineCatalog() {
  const cats = SEED.categories;
  return {
    version: 0,
    settings: SEED.settings,
    categories: cats.map((c) => ({ ...c, productCount: SEED.products.filter((p) => p.categoryId === c.id).length })),
    products: SEED.products.map((p) => ({ ...p, category: cats.find((c) => c.id === p.categoryId)?.name || '', inStock: true, discountPercent: 0 })),
  };
}

export function StoreProvider({ children }) {
  const [catalog, setCatalog] = useState({ version: -1, settings: {}, categories: [], products: [] });
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [cart, setCart] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const version = useRef(-1);
  const lastActive = useRef(Date.now());
  const toastTimer = useRef(null);

  const notify = useCallback((message, kind = 'ok') => {
    setToast({ message, kind, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const data = await api('GET', '/catalog');
      version.current = data.version;
      setCatalog(data); setOffline(false);
    } catch {
      if (version.current === -1) { setCatalog(offlineCatalog()); setOffline(true); }
    } finally { setLoading(false); }
  }, []);

  const loadCart = useCallback(async () => {
    try { const { cart: c } = await api('GET', '/cart'); setCart(c); } catch { /* keep current */ }
  }, []);

  // initial load
  useEffect(() => { loadCatalog(); loadCart(); }, [loadCatalog, loadCart]);

  // live updates: poll the tiny /version endpoint, refetch when the admin changed something
  useEffect(() => {
    const bump = () => { lastActive.current = Date.now(); };
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((e) => window.addEventListener(e, bump, { passive: true }));
    let timer;
    const tick = async () => {
      if (!document.hidden) {
        try {
          const { v } = await api('GET', '/version');
          if (v !== version.current) { await loadCatalog(); loadCart(); }
        } catch { /* offline, try again next tick */ }
      }
      timer = setTimeout(tick, Date.now() - lastActive.current > 180000 ? IDLE_POLL_MS : POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    const onVis = () => { if (!document.hidden) { lastActive.current = Date.now(); loadCatalog(); loadCart(); } };
    document.addEventListener('visibilitychange', onVis);
    const onMsg = (e) => { if (e.data === 'catalog') { loadCatalog(); loadCart(); } else if (e.data === 'cart') loadCart(); };
    bc?.addEventListener('message', onMsg);
    return () => {
      clearTimeout(timer);
      ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener('visibilitychange', onVis);
      bc?.removeEventListener('message', onMsg);
    };
  }, [loadCatalog, loadCart]);

  const mutate = useCallback(async (fn, okMsg) => {
    try {
      const { cart: c } = await fn();
      setCart(c); bc?.postMessage('cart');
      if (c.warnings?.length) notify(c.warnings[0], 'warn'); else if (okMsg) notify(okMsg);
      return c;
    } catch (e) {
      notify(e.message, 'err');
      if (e.data?.cart) setCart(e.data.cart); else loadCart();
      return null;
    }
  }, [loadCart, notify]);

  const addToCart = useCallback((product, qty = 1) => {
    const id = typeof product === 'object' ? product.id : product;
    const name = typeof product === 'object' ? product.name : 'Item';
    setCart((c) => ({ ...(c || { items: [], subtotal: 0, total: 0, discount: 0, delivery: 0 }), count: (c?.count || 0) + qty })); // instant badge
    return mutate(() => api('POST', '/cart/items', { productId: id, qty }), `${name} added to cart 🍨`);
  }, [mutate]);
  const setQty = useCallback((id, qty) => mutate(() => api('PATCH', `/cart/items/${id}`, { qty })), [mutate]);
  const removeItem = useCallback((id) => mutate(() => api('DELETE', `/cart/items/${id}`)), [mutate]);
  const clearCart = useCallback(() => mutate(() => api('DELETE', '/cart')), [mutate]);
  const applyCoupon = useCallback(async (code) => {
    try { const { cart: c } = await api('POST', '/cart/coupon', { code }); setCart(c); notify(`Coupon ${c.coupon?.code} applied 🎉`); return true; }
    catch (e) { notify(e.message, 'err'); return false; }
  }, [notify]);
  const removeCoupon = useCallback(() => mutate(() => api('DELETE', '/cart/coupon')), [mutate]);
  const placeOrder = useCallback(async (form) => {
    const { order } = await api('POST', '/orders', form);
    setCart(null); loadCart(); loadCatalog(); bc?.postMessage('cart');
    return order;
  }, [loadCart, loadCatalog]);

  const value = useMemo(() => ({
    products: catalog.products, categories: catalog.categories, settings: catalog.settings,
    loading, offline, cart, cartCount: cart?.count || 0, cartOpen, openCart: () => setCartOpen(true), closeCart: () => setCartOpen(false),
    addToCart, setQty, removeItem, clearCart, applyCoupon, removeCoupon, placeOrder, refresh: () => { loadCatalog(); loadCart(); },
    toast, notify,
  }), [catalog, loading, offline, cart, cartOpen, addToCart, setQty, removeItem, clearCart, applyCoupon, removeCoupon, placeOrder, loadCatalog, loadCart, toast, notify]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
