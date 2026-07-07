// pages/library.js — exercise library with gym/warmup tabs, search, AI classify.

import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useRef, useState, useCallback } from 'react';
import { findExerciseUrl } from '../lib/exerciseBank';

// ── helpers ──────────────────────────────────────────────────────────────────
function extractYtId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── CategoryBadge ─────────────────────────────────────────────────────────────
function CategoryBadge({ category, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOut(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClickOut);
    return () => document.removeEventListener('mousedown', onClickOut);
  }, [open]);

  const opts = [
    { id: 'gym',    label: 'Зал',      color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
    { id: 'warmup', label: 'Разминка', color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20' },
    { id: '',       label: 'Без кат.', color: 'text-slate-600 bg-white/[0.03] border-white/[0.07]' },
  ];
  const current = opts.find(o => o.id === (category || '')) || opts[2];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide transition hover:opacity-80 ${current.color}`}
        title="Изменить категорию"
      >
        {current.label}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-28 overflow-hidden rounded-xl border border-white/[0.10] bg-[#0d1a28] shadow-2xl">
          {opts.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => { onChange(o.id); setOpen(false); }}
              className={`w-full px-3 py-2 text-left text-[11px] font-semibold transition hover:bg-white/[0.06] ${o.id === (category || '') ? 'text-white' : 'text-slate-400'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── LibraryCard ───────────────────────────────────────────────────────────────
function LibraryCard({ card, apiKey, onDelete, onRename, onCategoryChange }) {
  const [imgUrl, setImgUrl] = useState(null);
  const [localHasImage, setLocalHasImage] = useState(card.hasImage);
  const [imgVersion, setImgVersion] = useState(0);
  const [uploadingImg, setUploadingImg] = useState(false);
  const fileInputRef = useRef(null);

  const [deleting, setDeleting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card.title || '');
  const [saving, setSaving] = useState(false);
  const [localCategory, setLocalCategory] = useState(card.category || '');

  useEffect(() => {
    if (!localHasImage || !apiKey) { setImgUrl(null); return; }
    let cancelled = false;
    let objectUrl = null;
    fetch(`/api/exercises/library-image?id=${encodeURIComponent(card.canonicalId)}&t=${imgVersion}`, {
      headers: { 'x-api-key': apiKey },
    })
      .then(r => (r.ok ? r.blob() : null))
      .then(blob => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setImgUrl(objectUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [card.canonicalId, localHasImage, imgVersion, apiKey]);

  function compressImage(file, maxPx = 600, quality = 0.78) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  async function handleImageFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const imageData = await compressImage(file);
      if (!imageData) return;
      const r = await fetch('/api/exercises/library-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ id: card.canonicalId, imageData }),
      });
      if (r.ok) { setImgUrl(null); setLocalHasImage(true); setImgVersion(Date.now()); }
    } finally {
      setUploadingImg(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeletePhoto() {
    await fetch(`/api/exercises/library-image?id=${encodeURIComponent(card.canonicalId)}`, {
      method: 'DELETE',
      headers: { 'x-api-key': apiKey },
    }).catch(() => {});
    setImgUrl(null);
    setLocalHasImage(false);
  }

  const bankUrl = card.title?.trim() ? findExerciseUrl(card.title) : null;
  const [ytSearchUrl, setYtSearchUrl] = useState(null);

  useEffect(() => {
    const base = card.video || card.autoVideo || bankUrl;
    if (base || !card.title?.trim() || !apiKey) return;
    let cancelled = false;
    fetch(`/api/exercises/youtube-search?name=${encodeURIComponent(card.title)}`, {
      headers: { 'x-api-key': apiKey },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data?.url && data.url !== 'none') setYtSearchUrl(data.url); })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.video, card.autoVideo, card.title, apiKey]);

  const resolvedVideoUrl = card.video || card.autoVideo || bankUrl || ytSearchUrl || null;
  const ytId = extractYtId(resolvedVideoUrl);

  const handleDelete = async () => {
    if (!confirm(`Удалить "${card.title}" из библиотеки?`)) return;
    setDeleting(true);
    try { await onDelete(card.canonicalId); } finally { setDeleting(false); }
  };

  const handleRename = async () => {
    const clean = titleDraft.trim();
    if (!clean || clean === card.title) { setEditingTitle(false); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/exercises/rename', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ canonicalId: card.canonicalId, newTitle: clean }),
      });
      if (r.ok) { onRename(card.canonicalId, clean); setEditingTitle(false); }
    } finally { setSaving(false); }
  };

  async function handleCategoryChange(cat) {
    setLocalCategory(cat);
    await fetch('/api/exercises/set-category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ id: card.canonicalId, category: cat }),
    }).catch(() => {});
    onCategoryChange(card.canonicalId, cat);
  }

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] shadow-card transition-all hover:border-white/[0.12]">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />

      {/* Image area */}
      <div className="relative aspect-square w-full overflow-hidden bg-white/[0.02]">
        {imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl} alt={card.title} className="h-full w-full object-contain" />
        ) : localHasImage ? (
          <div className="flex h-full w-full items-center justify-center text-[11px] text-slate-600">Загрузка…</div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl font-black text-slate-800 select-none">
            {initials(card.title)}
          </div>
        )}

        {/* Photo overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImg}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 disabled:opacity-50"
          >
            {uploadingImg
              ? <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
            }
            {uploadingImg ? 'Загрузка…' : localHasImage ? 'Сменить фото' : 'Добавить фото'}
          </button>
          {localHasImage && (
            <button
              type="button"
              onClick={handleDeletePhoto}
              className="rounded-lg bg-rose-500/20 px-3 py-1 text-[10px] font-semibold text-rose-300 backdrop-blur-sm transition hover:bg-rose-500/40"
            >
              Удалить фото
            </button>
          )}
        </div>

        {/* YouTube badge */}
        {ytId && (
          <a
            href={`https://www.youtube.com/watch?v=${ytId}`}
            target="_blank"
            rel="noreferrer"
            title="Видео на YouTube"
            className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-red-600/90 px-2 py-1 text-[10px] font-bold text-white shadow-lg backdrop-blur-sm transition hover:bg-red-500"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
            </svg>
            YT
          </a>
        )}
      </div>

      {/* Card footer */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {/* Title */}
        {editingTitle ? (
          <div className="flex items-start gap-1">
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingTitle(false); }}
              className="min-w-0 flex-1 rounded-lg border border-accent/40 bg-white/[0.05] px-2 py-1 text-[11px] font-semibold text-slate-100 outline-none"
            />
            <button
              type="button"
              onClick={handleRename}
              disabled={saving}
              className="rounded-lg bg-accent/20 px-2 py-1 text-[10px] font-bold text-accent transition hover:bg-accent/30 disabled:opacity-40"
            >
              {saving ? '…' : '✓'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setTitleDraft(card.title || ''); setEditingTitle(true); }}
            className="text-left text-[12px] font-semibold leading-snug text-slate-200 hover:text-accent transition"
            title="Нажми чтобы переименовать"
          >
            {card.title}
          </button>
        )}

        {/* Meta row */}
        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
          <div className="flex items-center gap-1">
            <CategoryBadge category={localCategory} onChange={handleCategoryChange} />
            {localHasImage && <span className="rounded border border-accent/20 bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold text-accent">фото</span>}
            {ytId && <span className="rounded border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-400">YT</span>}
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md px-2 py-1 text-[10px] font-semibold text-slate-700 transition hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-40"
          >
            {deleting ? '…' : '✕'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── LibraryList row ───────────────────────────────────────────────────────────
function LibraryRow({ card, apiKey, onDelete, onRename, onCategoryChange }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card.title || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [localCategory, setLocalCategory] = useState(card.category || '');

  const bankUrl = card.title?.trim() ? findExerciseUrl(card.title) : null;
  const resolvedVideoUrl = card.video || card.autoVideo || bankUrl || null;
  const ytId = extractYtId(resolvedVideoUrl);

  const handleRename = async () => {
    const clean = titleDraft.trim();
    if (!clean || clean === card.title) { setEditingTitle(false); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/exercises/rename', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ canonicalId: card.canonicalId, newTitle: clean }),
      });
      if (r.ok) { onRename(card.canonicalId, clean); setEditingTitle(false); }
    } finally { setSaving(false); }
  };

  async function handleCategoryChange(cat) {
    setLocalCategory(cat);
    await fetch('/api/exercises/set-category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ id: card.canonicalId, category: cat }),
    }).catch(() => {});
    onCategoryChange(card.canonicalId, cat);
  }

  const handleDelete = async () => {
    if (!confirm(`Удалить "${card.title}"?`)) return;
    setDeleting(true);
    try { await onDelete(card.canonicalId); } finally { setDeleting(false); }
  };

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5 transition hover:border-white/[0.10] hover:bg-white/[0.04]">
      {/* Thumb placeholder */}
      <div className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg bg-white/[0.04] text-[11px] font-black text-slate-700 select-none border border-white/[0.06]">
        {card.hasImage
          ? <span className="text-[9px] text-accent font-bold">IMG</span>
          : initials(card.title)}
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0">
        {editingTitle ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingTitle(false); }}
              className="min-w-0 flex-1 rounded-lg border border-accent/40 bg-white/[0.06] px-2 py-1 text-[12px] text-slate-100 outline-none"
            />
            <button onClick={handleRename} disabled={saving} className="rounded px-2 py-1 text-[10px] font-bold text-accent transition hover:bg-accent/10 disabled:opacity-40">
              {saving ? '…' : '✓'}
            </button>
            <button onClick={() => setEditingTitle(false)} className="text-[10px] text-slate-600 hover:text-slate-300">✕</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setTitleDraft(card.title || ''); setEditingTitle(true); }}
            className="block w-full truncate text-left text-[13px] font-semibold text-slate-200 transition hover:text-accent"
            title={card.title}
          >
            {card.title}
          </button>
        )}
      </div>

      {/* Badges */}
      <div className="shrink-0 flex items-center gap-2">
        <CategoryBadge category={localCategory} onChange={handleCategoryChange} />
        {card.hasImage && <span className="rounded border border-accent/20 bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold text-accent">фото</span>}
        {ytId && (
          <a href={`https://www.youtube.com/watch?v=${ytId}`} target="_blank" rel="noreferrer"
            className="rounded border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-400 transition hover:bg-red-500/20">
            YT
          </a>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="ml-1 rounded-md px-2 py-1 text-[10px] font-semibold text-slate-700 opacity-0 transition group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-40"
        >
          {deleting ? '…' : '✕'}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LibraryPage() {
  const [apiKey, setApiKey] = useState('');
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Tabs & filter
  const [tab, setTab] = useState('all'); // 'all' | 'gym' | 'warmup' | 'none'
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('updated'); // 'updated' | 'alpha' | 'nophoto'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // AI actions
  const [aiRenaming, setAiRenaming] = useState(false);
  const [aiRenameResult, setAiRenameResult] = useState(null);
  const [aiClassifying, setAiClassifying] = useState(false);
  const [aiClassifyResult, setAiClassifyResult] = useState(null);

  // Dedupe
  const [dedupeOpen, setDedupeOpen] = useState(false);
  const [dedupeLoading, setDedupeLoading] = useState(false);
  const [dedupeGroups, setDedupeGroups] = useState([]);
  const [mergingIdx, setMergingIdx] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('coachApiKey');
    if (saved) setApiKey(saved);
    else setLoading(false);
  }, []);

  const load = useCallback(() => {
    if (!apiKey) return;
    setLoading(true);
    setError('');
    fetch('/api/exercises/library', { headers: { 'x-api-key': apiKey } })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Ошибка (${r.status})`);
        setCards(Array.isArray(data.cards) ? data.cards : []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiKey]);

  useEffect(() => { load(); }, [load]);

  // ── Derived counts ──────────────────────────────────────────────────────────
  const gymCount     = cards.filter(c => c.category === 'gym').length;
  const warmupCount  = cards.filter(c => c.category === 'warmup').length;
  const noneCount    = cards.filter(c => !c.category).length;

  // ── Filtered + sorted cards ──────────────────────────────────────────────────
  const visible = cards
    .filter(c => {
      if (tab === 'gym')    return c.category === 'gym';
      if (tab === 'warmup') return c.category === 'warmup';
      if (tab === 'none')   return !c.category;
      return true; // 'all'
    })
    .filter(c => {
      if (!search.trim()) return true;
      return (c.title || '').toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      if (sort === 'alpha')   return (a.title || '').localeCompare(b.title || '', 'ru');
      if (sort === 'nophoto') return (a.hasImage ? 1 : 0) - (b.hasImage ? 1 : 0);
      return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
    });

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    await fetch(`/api/exercises/library?id=${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: { 'x-api-key': apiKey },
    }).catch(() => {});
    setCards(prev => prev.filter(c => c.canonicalId !== id));
  };

  const handleRename = (canonicalId, newTitle) => {
    setCards(prev => prev.map(c => c.canonicalId === canonicalId ? { ...c, title: newTitle } : c));
  };

  const handleCategoryChange = (canonicalId, category) => {
    setCards(prev => prev.map(c => c.canonicalId === canonicalId ? { ...c, category } : c));
  };

  const handleAiRename = async () => {
    if (!apiKey || aiRenaming) return;
    setAiRenaming(true);
    setAiRenameResult(null);
    setError('');
    try {
      const r = await fetch('/api/exercises/ai-rename-bulk', {
        method: 'POST', headers: { 'x-api-key': apiKey },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Ошибка (${r.status})`);
      if (Array.isArray(data.renames)) {
        const map = {};
        data.renames.forEach(({ canonicalId, newTitle }) => { map[canonicalId] = newTitle; });
        setCards(prev => prev.map(c => map[c.canonicalId] ? { ...c, title: map[c.canonicalId] } : c));
        setAiRenameResult(data.renames.length);
      }
    } catch (e) { setError(e.message); } finally { setAiRenaming(false); }
  };

  const handleAiClassify = async () => {
    if (!apiKey || aiClassifying) return;
    setAiClassifying(true);
    setAiClassifyResult(null);
    setError('');
    try {
      const r = await fetch('/api/exercises/ai-categorize', {
        method: 'POST', headers: { 'x-api-key': apiKey },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Ошибка (${r.status})`);
      if (Array.isArray(data.categorized)) {
        const map = {};
        data.categorized.forEach(({ id, category }) => { map[id] = category; });
        setCards(prev => prev.map(c => map[c.canonicalId] ? { ...c, category: map[c.canonicalId] } : c));
        setAiClassifyResult(data.categorized.length);
      }
    } catch (e) { setError(e.message); } finally { setAiClassifying(false); }
  };

  const openDedupe = async () => {
    if (!apiKey) return;
    setDedupeOpen(true);
    setDedupeLoading(true);
    setDedupeGroups([]);
    try {
      const r = await fetch('/api/exercises/dedupe', { headers: { 'x-api-key': apiKey } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Ошибка (${r.status})`);
      setDedupeGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch (e) { setError(e.message); setDedupeOpen(false); } finally { setDedupeLoading(false); }
  };

  const mergeGroup = async (group, idx) => {
    const targetId = group.cards[0].canonicalId;
    setMergingIdx(idx);
    try {
      for (const c of group.cards.slice(1)) {
        await fetch('/api/exercises/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ action: 'merge', sourceId: c.canonicalId, targetId }),
        }).catch(() => {});
      }
      setDedupeGroups(prev => prev.filter((_, i) => i !== idx));
      load();
    } finally { setMergingIdx(null); }
  };

  // ── Tabs config ─────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'all',    label: 'Все',      count: cards.length,  color: 'text-white' },
    { id: 'gym',    label: 'Зал',      count: gymCount,      color: 'text-amber-400' },
    { id: 'warmup', label: 'Разминка', count: warmupCount,   color: 'text-cyan-400' },
    ...(noneCount > 0 ? [{ id: 'none', label: 'Без кат.', count: noneCount, color: 'text-slate-500' }] : []),
  ];

  return (
    <>
      <Head><title>Библиотека упражнений · Periodyx</title></Head>
      <div className="min-h-screen px-4 py-6 text-slate-100 sm:px-8 sm:py-10" style={{ background: '#060c15' }}>
        <div className="mx-auto max-w-6xl">

          {/* ── Header ── */}
          <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/" className="text-[12px] font-semibold text-slate-500 transition hover:text-accent">
                ← Главная
              </Link>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Библиотека упражнений</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px] text-slate-500">
                <span>Всего: <span className="font-semibold text-slate-300">{cards.length}</span></span>
                {gymCount > 0 && <span className="text-amber-400/70">Зал: <span className="font-semibold">{gymCount}</span></span>}
                {warmupCount > 0 && <span className="text-cyan-400/70">Разминка: <span className="font-semibold">{warmupCount}</span></span>}
                {noneCount > 0 && <span className="text-slate-600">Без кат.: <span className="font-semibold">{noneCount}</span></span>}
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* AI Classify */}
              <button
                type="button"
                onClick={handleAiClassify}
                disabled={!apiKey || aiClassifying || noneCount === 0}
                className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3.5 py-2 text-[12px] font-semibold text-amber-400 transition hover:border-amber-500/50 hover:bg-amber-500/[0.12] disabled:opacity-40"
                title={noneCount === 0 ? 'Все упражнения уже классифицированы' : `Классифицировать ${noneCount} упражнений через AI`}
              >
                {aiClassifying ? 'Классификация…' : `AI Классифицировать${noneCount > 0 ? ` (${noneCount})` : ''}`}
              </button>

              {/* AI Rename */}
              <button
                type="button"
                onClick={handleAiRename}
                disabled={!apiKey || aiRenaming}
                className="rounded-xl border border-accent/30 bg-accent/[0.07] px-3.5 py-2 text-[12px] font-semibold text-accent transition hover:border-accent/50 hover:bg-accent/[0.12] disabled:opacity-40"
                title="Перевести русские названия в проф. английский через AI"
              >
                {aiRenaming ? 'Перевожу…' : 'AI → English'}
              </button>

              {/* Dedupe */}
              <button
                type="button"
                onClick={openDedupe}
                disabled={!apiKey}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-[12px] font-semibold text-slate-300 transition hover:border-white/[0.16] hover:text-white disabled:opacity-40"
              >
                Дубли
              </button>

              {/* Refresh */}
              <button
                type="button"
                onClick={load}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-[12px] font-semibold text-slate-300 transition hover:border-white/[0.16] hover:text-white"
              >
                ↻
              </button>
            </div>
          </div>

          {/* AI result toasts */}
          {aiClassifyResult !== null && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-2.5 text-[12px] text-amber-300">
              <span>✓</span>
              <span>Классифицировано: <strong>{aiClassifyResult}</strong> упражнений</span>
              <button onClick={() => setAiClassifyResult(null)} className="ml-auto text-amber-500/60 hover:text-amber-300">✕</button>
            </div>
          )}
          {aiRenameResult !== null && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/[0.07] px-4 py-2.5 text-[12px] text-accent">
              <span>✓</span>
              <span>Переименовано: <strong>{aiRenameResult}</strong> упражнений</span>
              <button onClick={() => setAiRenameResult(null)} className="ml-auto text-accent/50 hover:text-accent">✕</button>
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.08] px-4 py-3 text-[12px] text-rose-400">
              {error}
              <button onClick={() => setError('')} className="ml-3 text-rose-500/60 hover:text-rose-300">✕</button>
            </div>
          )}

          {!apiKey && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 text-center text-[13px] text-slate-500">
              Не найден API-ключ. Открой <Link href="/" className="text-accent hover:underline">главную</Link> и подключи ключ тренера.
            </div>
          )}

          {apiKey && (
            <>
              {/* ── Tabs + Search + Sort ── */}
              <div className="mb-5 flex flex-wrap items-center gap-3">
                {/* Tab bar */}
                <div className="flex rounded-xl border border-white/[0.06] bg-white/[0.03] p-0.5">
                  {tabs.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={`flex items-center gap-1.5 rounded-[9px] px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
                        tab === t.id ? 'bg-white/[0.09] text-white shadow-sm' : 'text-slate-600 hover:text-slate-400'
                      }`}
                    >
                      <span className={tab === t.id ? t.color : ''}>{t.label}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === t.id ? 'bg-white/[0.12] text-white' : 'text-slate-700'}`}>
                        {t.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative flex-1 min-w-[160px] max-w-xs">
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Поиск…"
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-600 outline-none transition focus:border-accent/40 focus:bg-white/[0.06]"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 hover:text-slate-300">✕</button>
                  )}
                </div>

                {/* Sort */}
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value)}
                  className="rounded-xl border border-white/[0.08] bg-[#0d1520] px-3 py-1.5 text-[12px] text-slate-300 outline-none transition focus:border-accent/30"
                >
                  <option value="updated">Новые первые</option>
                  <option value="alpha">А–Я</option>
                  <option value="nophoto">Без фото первые</option>
                </select>

                {/* View toggle */}
                <div className="flex rounded-xl border border-white/[0.06] bg-white/[0.03] p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`rounded-[9px] px-2.5 py-1.5 text-[11px] transition-all ${viewMode === 'grid' ? 'bg-white/[0.09] text-white' : 'text-slate-600 hover:text-slate-400'}`}
                    title="Сетка"
                  >
                    ⊞
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`rounded-[9px] px-2.5 py-1.5 text-[11px] transition-all ${viewMode === 'list' ? 'bg-white/[0.09] text-white' : 'text-slate-600 hover:text-slate-400'}`}
                    title="Список"
                  >
                    ☰
                  </button>
                </div>
              </div>

              {/* ── Uncategorized hint ── */}
              {tab === 'all' && noneCount > 0 && (
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-4 py-2.5 text-[12px] text-amber-400/80">
                  <span>{noneCount} упражнений без категории</span>
                  <button
                    type="button"
                    onClick={handleAiClassify}
                    disabled={aiClassifying}
                    className="ml-auto rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-40"
                  >
                    {aiClassifying ? 'Классификация…' : 'Классифицировать (AI)'}
                  </button>
                </div>
              )}

              {/* ── Loading ── */}
              {loading && (
                <div className="py-16 text-center text-[13px] text-slate-600">
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
                  Загрузка библиотеки…
                </div>
              )}

              {/* ── Empty ── */}
              {!loading && visible.length === 0 && (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-14 text-center">
                  <div className="mb-2 text-4xl opacity-20">📚</div>
                  {search
                    ? <p className="text-[13px] text-slate-500">По запросу «{search}» ничего не найдено</p>
                    : tab !== 'all'
                    ? <p className="text-[13px] text-slate-500">В этой категории пусто. Используй кнопки ▼ на карточках чтобы назначить категорию.</p>
                    : <p className="text-[13px] text-slate-500">Библиотека пуста. Добавляй фото и видео упражнений на главной.</p>
                  }
                </div>
              )}

              {/* ── Grid view ── */}
              {!loading && visible.length > 0 && viewMode === 'grid' && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
                  {visible.map(card => (
                    <LibraryCard
                      key={card.canonicalId}
                      card={card}
                      apiKey={apiKey}
                      onDelete={handleDelete}
                      onRename={handleRename}
                      onCategoryChange={handleCategoryChange}
                    />
                  ))}
                </div>
              )}

              {/* ── List view ── */}
              {!loading && visible.length > 0 && viewMode === 'list' && (
                <div className="space-y-1">
                  {visible.map(card => (
                    <LibraryRow
                      key={card.canonicalId}
                      card={card}
                      apiKey={apiKey}
                      onDelete={handleDelete}
                      onRename={handleRename}
                      onCategoryChange={handleCategoryChange}
                    />
                  ))}
                </div>
              )}

              {visible.length > 0 && (
                <p className="mt-4 text-center text-[11px] text-slate-700">{visible.length} упражнений</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Dedupe modal ── */}
      {dedupeOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black tracking-tight text-white">Возможные дубли</h2>
              <button
                type="button"
                onClick={() => setDedupeOpen(false)}
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] font-semibold text-slate-300 transition hover:text-white"
              >
                Закрыть
              </button>
            </div>
            {dedupeLoading && <div className="py-16 text-center text-[13px] text-slate-500">Анализ библиотеки…</div>}
            {!dedupeLoading && dedupeGroups.length === 0 && (
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 text-center text-[13px] text-slate-500">
                Дубли не найдены.
              </div>
            )}
            <div className="space-y-3">
              {dedupeGroups.map((group, idx) => (
                <div key={idx} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="mb-3 space-y-1.5">
                    {group.cards.map(c => (
                      <div key={c.canonicalId} className="flex items-center gap-2 text-[12px] text-slate-300">
                        <span className="line-clamp-1" title={c.title}>{c.title}</span>
                        {c.hasImage && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">фото</span>}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => mergeGroup(group, idx)}
                    disabled={mergingIdx === idx}
                    className="rounded-lg bg-accent/15 px-3 py-1.5 text-[11px] font-semibold text-accent transition hover:bg-accent/25 disabled:opacity-40"
                  >
                    {mergingIdx === idx ? 'Слияние…' : 'Слить → оставить первую'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
