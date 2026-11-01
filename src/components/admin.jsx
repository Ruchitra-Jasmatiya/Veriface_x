import React, { useState, useEffect, useMemo, useRef } from 'react';
import defaultCatalog from '../data/defaultCatalog.json';
import './admin.css';

const PW_KEY = 'radhika_admin_pw';

// Shrink + convert a photo to a small WebP in the browser (keeps the shop fast).
async function compressImage(file) {
  const bmp = await createImageBitmap(file);
  const MAX = 1400;
  const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.82));
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

async function call(password, body) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 401 ? 'Wrong password' : data.error || 'Something went wrong');
  return data;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export default function Admin() {
  const [password, setPassword] = useState(() => {
    try { return sessionStorage.getItem(PW_KEY) || ''; } catch { return ''; }
  });
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [loginErr, setLoginErr] = useState('');

  const [catalog, setCatalog] = useState(null);
  const [selected, setSelected] = useState('all');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null); // {type, text}
  const [newCat, setNewCat] = useState('');
  const [showAddCat, setShowAddCat] = useState(false);
  const fileRef = useRef(null);
  const replaceRef = useRef(null);
  const replaceId = useRef(null);

  const flash = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  // Try the remembered password on first open
  useEffect(() => {
    if (password) {
      call(password, { action: 'login' })
        .then(() => setAuthed(true))
        .catch(() => { setPassword(''); try { sessionStorage.removeItem(PW_KEY); } catch { /* ignore */ } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the live catalog once logged in
  useEffect(() => {
    if (!authed) return;
    fetch('/api/catalog', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setCatalog(d && d.products ? d : defaultCatalog))
      .catch(() => setCatalog(defaultCatalog));
  }, [authed]);

  // Warn before leaving with unsaved work
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const login = async (e) => {
    e.preventDefault();
    setLoginErr('');
    setBusy('login');
    try {
      await call(pwInput, { action: 'login' });
      try { sessionStorage.setItem(PW_KEY, pwInput); } catch { /* ignore */ }
      setPassword(pwInput);
      setAuthed(true);
    } catch (err) {
      setLoginErr(err.message);
    }
    setBusy('');
  };

  const logout = () => {
    try { sessionStorage.removeItem(PW_KEY); } catch { /* ignore */ }
    setPassword(''); setAuthed(false); setCatalog(null); setPwInput('');
  };

  const edit = (fn) => { setCatalog((c) => fn(c)); setDirty(true); };

  const visible = useMemo(() => {
    if (!catalog) return [];
    return selected === 'all' ? catalog.products : catalog.products.filter((p) => p.category === selected);
  }, [catalog, selected]);

  const countOf = (id) => catalog.products.filter((p) => p.category === id).length;
  const current = catalog?.categories.find((c) => c.id === selected);

  // ---------- categories ----------
  const addCategory = (e) => {
    e.preventDefault();
    const label = newCat.trim();
    const id = slug(label);
    if (!id) return;
    if (catalog.categories.some((c) => c.id === id)) return flash('err', 'That category already exists');
    edit((c) => ({ ...c, categories: [...c.categories, { id, label }] }));
    setSelected(id); setNewCat(''); setShowAddCat(false);
  };

  const renameCategory = () => {
    const label = window.prompt('New name for this category:', current.label);
    if (label && label.trim()) {
      edit((c) => ({ ...c, categories: c.categories.map((x) => (x.id === selected ? { ...x, label: label.trim() } : x)) }));
    }
  };

  const deleteCategory = () => {
    if (countOf(selected) > 0) return flash('err', 'Delete or move the images in this category first');
    if (!window.confirm(`Delete category "${current.label}"?`)) return;
    edit((c) => ({ ...c, categories: c.categories.filter((x) => x.id !== selected) }));
    setSelected('all');
  };

  // ---------- products ----------
  const updateProduct = (id, patch) =>
    edit((c) => ({ ...c, products: c.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  const deleteProduct = (p) => {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    edit((c) => ({ ...c, products: c.products.filter((x) => x.id !== p.id) }));
  };

  const addImages = async (files) => {
    if (!files.length) return;
    setBusy('compress');
    try {
      const added = [];
      let n = countOf(selected);
      for (const f of files) {
        const dataUrl = await compressImage(f);
        n += 1;
        added.push({
          id: newId(), name: `${current.label} ${n}`, category: selected, price: 999,
          img: dataUrl, _pending: dataUrl, sizes: ['L', 'XL', 'XXL'], isNew: true,
        });
      }
      edit((c) => ({ ...c, products: [...c.products, ...added] }));
    } catch {
      flash('err', 'Could not read that image');
    }
    setBusy('');
  };

  const replaceImage = async (file) => {
    if (!file || !replaceId.current) return;
    setBusy('compress');
    try {
      const dataUrl = await compressImage(file);
      updateProduct(replaceId.current, { img: dataUrl, _pending: dataUrl });
    } catch {
      flash('err', 'Could not read that image');
    }
    setBusy('');
  };

  // ---------- save ----------
  const save = async () => {
    setBusy('save');
    try {
      const products = [];
      for (const p of catalog.products) {
        const { _pending, ...rest } = p;
        if (_pending) {
          const { url } = await call(password, { action: 'upload', dataUrl: _pending });
          rest.img = url;
        }
        products.push(rest);
      }
      const next = { ...catalog, products };
      await call(password, { action: 'save', catalog: next });
      setCatalog(next);
      setDirty(false);
      flash('ok', 'Saved! Your shop page is updated.');
    } catch (err) {
      flash('err', err.message);
    }
    setBusy('');
  };

  // ---------- screens ----------
  if (!authed) {
    return (
      <div className="adm adm-login">
        <form className="adm-login-card" onSubmit={login}>
          <h1>RADHIKA</h1>
          <p>Shop Admin</p>
          <input
            type="password" placeholder="Password" value={pwInput} autoFocus
            onChange={(e) => setPwInput(e.target.value)}
          />
          {loginErr && <div className="adm-err">{loginErr}</div>}
          <button className="adm-btn primary" disabled={!pwInput || busy === 'login'}>
            {busy === 'login' ? 'Checking…' : 'Log in'}
          </button>
        </form>
      </div>
    );
  }

  if (!catalog) return <div className="adm"><p className="adm-loading">Loading…</p></div>;

  return (
    <div className="adm">
      <header className="adm-top">
        <h1>Shop Admin</h1>
        <div>
          <a href="/shop" target="_blank" rel="noreferrer">View shop</a>
          <button className="adm-link" onClick={logout}>Log out</button>
        </div>
      </header>

      <div className="adm-chips">
        <button className={`chip ${selected === 'all' ? 'on' : ''}`} onClick={() => setSelected('all')}>
          All <span>{catalog.products.length}</span>
        </button>
        {catalog.categories.map((c) => (
          <button key={c.id} className={`chip ${selected === c.id ? 'on' : ''}`} onClick={() => setSelected(c.id)}>
            {c.label} <span>{countOf(c.id)}</span>
          </button>
        ))}
        <button className="chip add" onClick={() => setShowAddCat((v) => !v)}>+ Category</button>
      </div>

      {showAddCat && (
        <form className="adm-addcat" onSubmit={addCategory}>
          <input placeholder="New category name, e.g. Lehengas" value={newCat} autoFocus onChange={(e) => setNewCat(e.target.value)} />
          <button className="adm-btn primary" disabled={!slug(newCat)}>Add</button>
        </form>
      )}

      {current && (
        <div className="adm-cathead">
          <h2>{current.label}</h2>
          <div>
            <button className="adm-link" onClick={renameCategory}>Rename</button>
            <button className="adm-link danger" onClick={deleteCategory}>Delete</button>
          </div>
        </div>
      )}

      <div className="adm-actions">
        <button className="adm-btn primary" disabled={!current || busy === 'compress'} onClick={() => fileRef.current.click()}>
          {busy === 'compress' ? 'Preparing…' : '+ Add images'}
        </button>
        {!current && <span className="adm-hint">Pick a category above to add images</span>}
        <input
          ref={fileRef} type="file" accept="image/*" multiple hidden
          onChange={(e) => { addImages([...e.target.files]); e.target.value = ''; }}
        />
        <input
          ref={replaceRef} type="file" accept="image/*" hidden
          onChange={(e) => { replaceImage(e.target.files[0]); e.target.value = ''; }}
        />
      </div>

      {visible.length === 0 && <p className="adm-empty">No images here yet.</p>}

      <ul className="adm-list">
        {visible.map((p) => (
          <li key={p.id} className="adm-item">
            <button
              className="adm-thumb" title="Change image"
              onClick={() => { replaceId.current = p.id; replaceRef.current.click(); }}
            >
              <img src={p.img} alt={p.name} loading="lazy" decoding="async" />
              {p._pending && <em>New</em>}
              <span>Change</span>
            </button>
            <div className="adm-fields">
              <input
                aria-label="Product name" value={p.name}
                onChange={(e) => updateProduct(p.id, { name: e.target.value })}
              />
              <div className="adm-row">
                <label className="adm-price">
                  ₹
                  <input
                    aria-label="Price" type="number" inputMode="numeric" min="0" value={p.price}
                    onChange={(e) => updateProduct(p.id, { price: e.target.value === '' ? '' : Number(e.target.value) })}
                  />
                </label>
                <label className="adm-check">
                  <input type="checkbox" checked={p.isNew} onChange={(e) => updateProduct(p.id, { isNew: e.target.checked })} />
                  New
                </label>
                {selected === 'all' && (
                  <select
                    aria-label="Category" value={p.category}
                    onChange={(e) => updateProduct(p.id, { category: e.target.value })}
                  >
                    {catalog.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                )}
                <button className="adm-link danger" onClick={() => deleteProduct(p)}>Delete</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {msg && <div className={`adm-toast ${msg.type}`}>{msg.text}</div>}

      <div className="adm-savebar">
        <span>{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
        <button className="adm-btn primary" disabled={!dirty || busy === 'save'} onClick={save}>
          {busy === 'save' ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
