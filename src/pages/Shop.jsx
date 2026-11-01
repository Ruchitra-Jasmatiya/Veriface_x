// =========================================================
// Shop.jsx - banner, sticky category tabs, search / sort / filters,
// product grid, factory video, chaat gallery, fan favourites.
//
// REPLACE (see README): banner photo, factory video, chaat photos.
// The selected category lives in the URL (?cat=Sev) so the Home
// tiles and footer links can open the Shop on a category.
// =========================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Pause, Play, Search, SlidersHorizontal, Volume2, VolumeX, X } from 'lucide-react';
import Reveal from '../components/Reveal.jsx';
import Img from '../components/Img.jsx';
import ProductCard from '../components/ProductCard.jsx';
import QuickView from '../components/QuickView.jsx';
import FilterSheet, { NO_FILTERS, PRICE_RANGES, countActive } from '../components/FilterSheet.jsx';
import BottomSheet from '../components/BottomSheet.jsx';
import { getProducts } from '../lib/api.js';
import { CATEGORIES } from '../data/products.js';
import './Shop.css';

// ---------- Editable content ----------
const BANNER_IMAGE = '/images/hero/shop-banner.jpg'; // REPLACE: tasty banner photo
const FACTORY_VIDEO = '/videos/factory.mp4'; // REPLACE: your factory / brand video
const FACTORY_POSTER = '/images/hero/factory-poster.jpg'; // REPLACE: poster image for the video

// "This is how our customers describe us" - REPLACE with real quotes
const QUOTES = [
  { text: 'Crispy, fresh and never stale. Mera favourite!', who: 'Customer name, City' }, // REPLACE
  { text: 'The ratlami sev is exactly like back home.', who: 'Customer name, City' }, // REPLACE
  { text: 'Whole family finished the khasta puri in one evening.', who: 'Customer name, City' }, // REPLACE
];

// REPLACE: put these photos in public/images/chaat/
const CHAAT = [
  { src: '/images/chaat/pani-puri-chaat.jpg', caption: 'Pani puri chaat' },
  { src: '/images/chaat/khasta-kachori-chaat.jpg', caption: 'Khasta kachori chaat' },
  { src: '/images/chaat/sev-puri.jpg', caption: 'Sev puri' },
  { src: '/images/chaat/bhel.jpg', caption: 'Bhel' },
  { src: '/images/chaat/dahi-papdi-chaat.jpg', caption: 'Dahi papdi chaat' },
  { src: '/images/chaat/masala-puri.jpg', caption: 'Masala puri' },
  { src: '/images/chaat/sev-tamatar.jpg', caption: 'Sev tamatar' },
  { src: '/images/chaat/corn-chaat.jpg', caption: 'Corn puff chaat' },
];

const TABS = ['All', ...CATEGORIES];
const SORTS = [
  { id: 'trending', label: 'Trending' },
  { id: 'low', label: 'Price: Low to High' },
  { id: 'high', label: 'Price: High to Low' },
  { id: 'rating', label: 'Rating' },
  { id: 'az', label: 'A to Z' },
];

function sortList(list, sort) {
  const a = [...list];
  switch (sort) {
    case 'low': return a.sort((x, y) => x.price - y.price);
    case 'high': return a.sort((x, y) => y.price - x.price);
    case 'rating': return a.sort((x, y) => y.rating - x.rating || y.reviews - x.reviews);
    case 'az': return a.sort((x, y) => x.name.localeCompare(y.name));
    default: return a.sort((x, y) => Number(y.trending) - Number(x.trending) || y.reviews - x.reviews);
  }
}

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const [all, setAll] = useState(null); // null = loading
  // ?q=pani opens the shop with that search already typed in
  const [query, setQuery] = useState(() => params.get('q') || '');
  const [sort, setSort] = useState('trending');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [quick, setQuick] = useState(null);
  const [photo, setPhoto] = useState(null);

  const catParam = params.get('cat');
  const category = TABS.includes(catParam) ? catParam : 'All';

  useEffect(() => {
    let live = true;
    getProducts().then((list) => live && setAll(list));
    return () => { live = false; };
  }, []);

  // keep the search box in step when a link changes ?q= while we are already here
  const qParam = params.get('q');
  useEffect(() => {
    if (qParam !== null) setQuery(qParam);
  }, [qParam]);

  const setCategory = (c) => {
    const next = new URLSearchParams(params);
    if (c === 'All') next.delete('cat');
    else next.set('cat', c);
    setParams(next, { replace: true });
  };

  // ---------- filtering (category + search + filters + sort together) ----------
  const range = PRICE_RANGES.find((r) => r.id === filters.price);
  const results = useMemo(() => {
    if (!all) return [];
    const q = query.trim().toLowerCase();
    const filtered = all.filter((p) => {
      if (category !== 'All' && p.category !== category) return false;
      if (q && !(p.name.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)))) return false;
      if (range && (p.price < range.min || p.price > range.max)) return false;
      if (filters.veg && !p.veg) return false;
      if (filters.spice.length && !filters.spice.includes(p.spice)) return false;
      if (filters.packs.length && !filters.packs.includes(p.weight)) return false;
      return true;
    });
    return sortList(filtered, sort);
  }, [all, category, query, range, filters, sort]);

  const activeCount = countActive(filters);
  const hasAnyFilter = activeCount > 0 || query.trim() || category !== 'All';

  const resetAll = () => {
    setQuery('');
    setFilters(NO_FILTERS);
    setSort('trending');
    setCategory('All');
  };

  // chips that can be removed with one tap
  const chips = [];
  if (range) chips.push({ id: 'price', label: range.label, remove: () => setFilters({ ...filters, price: null }) });
  if (filters.veg) chips.push({ id: 'veg', label: 'Veg only', remove: () => setFilters({ ...filters, veg: false }) });
  filters.spice.forEach((s) => chips.push({ id: `s-${s}`, label: `${s} spice`, remove: () => setFilters({ ...filters, spice: filters.spice.filter((x) => x !== s) }) }));
  filters.packs.forEach((s) => chips.push({ id: `k-${s}`, label: s, remove: () => setFilters({ ...filters, packs: filters.packs.filter((x) => x !== s) }) }));

  const favourites = useMemo(
    () => (all ? all.filter((p) => p.trending).sort((a, b) => b.reviews - a.reviews) : []),
    [all]
  );

  return (
    <div className="shop">
      {/* ---------- Title band ---------- */}
      <section className="shop__hero band-brand">
        <div className="container shop__heroGrid">
          <Reveal className="shop__heroText">
            <span className="eyebrow">Taaza, garam, crunchy</span>
            <h1>The Snack Shelf</h1>
            <p>Pick your crunch. Everything is fried fresh, packed fast and sealed tight.</p>
          </Reveal>
          <Reveal className="shop__banner sticker" delay={0.1}>
            {/* REPLACE: public/images/hero/shop-banner.jpg */}
            <Img src={BANNER_IMAGE} alt="A spread of Taran Hari namkeen and snacks" eager />
          </Reveal>
        </div>
      </section>

      {/* ---------- Sticky category tabs ---------- */}
      <div className="shop__tabsWrap">
        <div className="container">
          <div className="shop__tabs" role="tablist" aria-label="Snack categories">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={category === t}
                className={`shop__tab ${category === t ? 'is-on' : ''}`}
                onClick={() => setCategory(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- Controls ---------- */}
      <section className="section shop__main band-paper">
        <div className="container">
          <div className="shop__controls">
            <div className="shop__search">
              <Search size={20} aria-hidden="true" />
              <label htmlFor="shop-search" className="sr-only">Search snacks</label>
              <input
                id="shop-search"
                type="search"
                placeholder="Search bhujia, sev, puri..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
              {query && (
                <button type="button" className="shop__clear" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={18} strokeWidth={3} />
                </button>
              )}
            </div>

            <div className="shop__row2">
              <div className="shop__sort">
                <label htmlFor="shop-sort" className="sr-only">Sort by</label>
                <select id="shop-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                  {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <button type="button" className="btn btn--accent shop__filterBtn" onClick={() => setFilterOpen(true)}>
                <SlidersHorizontal size={18} strokeWidth={3} aria-hidden="true" />
                Filters{activeCount ? ` (${activeCount})` : ''}
              </button>
            </div>
          </div>

          <div className="shop__status">
            <p aria-live="polite">
              <strong>{all ? results.length : '...'}</strong> {results.length === 1 ? 'snack' : 'snacks'} found
              {category !== 'All' && <> in <strong>{category}</strong></>}
            </p>
            {hasAnyFilter && <button type="button" className="shop__reset" onClick={resetAll}>Reset all</button>}
          </div>

          {chips.length > 0 && (
            <ul className="shop__chips" aria-label="Active filters">
              {chips.map((c) => (
                <li key={c.id}>
                  <button type="button" className="fchip" onClick={c.remove} aria-label={`Remove filter ${c.label}`}>
                    {c.label} <X size={14} strokeWidth={3} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* ---------- Grid ---------- */}
          {all === null ? (
            <div className="shop__grid" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton sticker" />)}
            </div>
          ) : results.length === 0 ? (
            <div className="empty sticker">
              <h3>Arre! Nothing matches.</h3>
              <p>Try a different word or loosen a filter. Our snacks are shy, not missing.</p>
              <button type="button" className="btn" onClick={resetAll}>Reset and show all</button>
            </div>
          ) : (
            <motion.div className="shop__grid" layout>
              <AnimatePresence mode="popLayout" initial={false}>
                {results.map((p) => (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <ProductCard product={p} onOpen={setQuick} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </section>

      {/* ---------- Factory video ---------- */}
      <section className="section band-accent shop__videoSec">
        <div className="container shop__videoGrid">
          <Reveal className="shop__videoText">
            <span className="eyebrow">Behind the crunch</span>
            <h2>Made fresh. Packed with care.</h2>
            <p>From the first roll of dough to the last seal, every packet is checked by hand.</p>
          </Reveal>
          <Reveal delay={0.1}>
            <FactoryVideo />
          </Reveal>
          <div className="shop__quotes">
            <h3 className="shop__quotesTitle">This is how our customers describe us</h3>
            {QUOTES.map((q, i) => (
              <Reveal key={q.text} delay={i * 0.1}>
                <blockquote className={`bubble ${i % 2 ? 'bubble--r' : ''}`}>
                  <p>&ldquo;{q.text}&rdquo;</p>
                  <footer>{q.who}</footer>
                </blockquote>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Chaat gallery ---------- */}
      <section className="section band-paper">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Plate it up</span>
            <h2>Chaat gallery</h2>
            <p>Our snacks, dressed up. Tap a photo to see it bigger.</p>
          </Reveal>
          <div className="gallery">
            {CHAAT.map((c, i) => (
              <Reveal key={c.caption} delay={(i % 4) * 0.07} className={`gallery__item g${i}`}>
                <button type="button" className="gallery__btn sticker" onClick={() => setPhoto(c)} aria-label={`Open photo: ${c.caption}`}>
                  <Img src={c.src} alt={c.caption} />
                  <span className="gallery__cap">{c.caption}</span>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Fan favourites ---------- */}
      <section className="section band-ink shop__fav">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Sab ke favourite</span>
            <h2>Fan favourites</h2>
          </Reveal>
        </div>
        <div className="shop__scroller" tabIndex={0} aria-label="Fan favourite snacks, scroll sideways">
          <div className="shop__scrollInner">
            {favourites.map((p) => <ProductCard key={p.id} product={p} onOpen={setQuick} compact />)}
          </div>
        </div>
      </section>

      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} filters={filters} onApply={setFilters} />
      <QuickView product={quick} onClose={() => setQuick(null)} />

      <BottomSheet open={!!photo} onClose={() => setPhoto(null)} title={photo?.caption || 'Photo'}>
        {photo && <div className="lightbox sticker"><Img src={photo.src} alt={photo.caption} /></div>}
      </BottomSheet>
    </div>
  );
}

// Looping muted video. Tap the button to hear it with sound.
function FactoryVideo() {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);

  const toggleSound = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted && v.paused) v.play().catch(() => {});
  };
  const togglePlay = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  if (failed) {
    return (
      <div className="vid sticker">
        <div className="vid__ph">
          <Play size={44} strokeWidth={2.5} aria-hidden="true" />
          <strong>Factory video goes here</strong>
          {/* REPLACE: add public/videos/factory.mp4 */}
          <span>REPLACE: public/videos/factory.mp4</span>
        </div>
      </div>
    );
  }

  return (
    <div className="vid sticker">
      <video
        ref={ref}
        src={FACTORY_VIDEO}
        poster={FACTORY_POSTER}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-label="Video of the Taran Hari factory"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />
      <div className="vid__bar">
        <button type="button" className="icon-btn" onClick={togglePlay} aria-label={playing ? 'Pause video' : 'Play video'}>
          {playing ? <Pause size={20} strokeWidth={3} /> : <Play size={20} strokeWidth={3} />}
        </button>
        <button type="button" className="btn btn--white vid__sound" onClick={toggleSound}>
          {muted ? <VolumeX size={18} strokeWidth={3} aria-hidden="true" /> : <Volume2 size={18} strokeWidth={3} aria-hidden="true" />}
          {muted ? 'Tap for sound' : 'Sound on'}
        </button>
      </div>
    </div>
  );
}
