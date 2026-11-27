(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const REFRESH_MS = 8000;
  const STATUS_LABEL = { new: 'New', received: 'Received', blocked: 'Blocked' };

  let payments = [];
  let settings = null;
  let filter = 'all';
  let knownIds = null; // ids seen so far; null until the first load
  let freshIds = new Set();
  let unseen = 0;
  let timer = null;

  const inr = (n) =>
    `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const when = (iso) =>
    new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const size = (bytes) =>
    bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c);
    return el;
  }

  let toastTimer;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3000);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      cache: 'no-store',
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/api/admin/login') {
      showLogin();
      throw new Error(body.error || 'Please log in again.');
    }
    if (!res.ok) throw new Error(body.error || 'Something went wrong.');
    return body;
  }

  // ---------- login ----------

  function showLogin() {
    clearInterval(timer);
    $('app-view').hidden = true;
    $('login-view').hidden = false;
    $($('username').value ? 'password' : 'username').focus();
  }

  async function showApp() {
    $('login-view').hidden = true;
    $('app-view').hidden = false;
    $('share-link').textContent = `${location.origin}/`;
    await Promise.all([loadSettings(), loadPayments()]);
    clearInterval(timer);
    timer = setInterval(() => {
      if (!document.hidden) loadPayments().catch(() => {});
    }, REFRESH_MS);
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const err = $('login-error');
    err.hidden = true;
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username: $('username').value, password: $('password').value }),
      });
      $('password').value = '';
      await showApp();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    }
  });

  $('logout').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    knownIds = null;
    showLogin();
  });

  $('copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('share-link').textContent);
      toast('Link copied');
    } catch {
      toast('Select the link and copy it');
    }
  });

  // ---------- tabs ----------

  function selectTab(name) {
    for (const t of ['payments', 'settings']) {
      $(`tab-btn-${t}`).setAttribute('aria-selected', String(t === name));
      $(`tab-${t}`).hidden = t !== name;
    }
    if (name === 'payments') {
      unseen = 0;
      updateBadge();
    }
  }
  $('tab-btn-payments').addEventListener('click', () => selectTab('payments'));
  $('tab-btn-settings').addEventListener('click', () => selectTab('settings'));

  function updateBadge() {
    $('new-badge').hidden = unseen === 0;
    $('new-badge').textContent = unseen;
    document.title = unseen ? `(${unseen}) Payments Admin` : 'Payments Admin';
  }

  // ---------- payments ----------

  async function loadPayments() {
    const data = await api('/api/admin/payments');
    payments = data.payments;
    if (knownIds) {
      const added = payments.filter((p) => !knownIds.has(p.id));
      if (added.length) {
        freshIds = new Set(added.map((p) => p.id));
        const p = added[0];
        toast(`New payment: ${inr(p.amount)} · UTR ${p.utr}${p.name ? ` · ${p.name}` : ''}`);
        if (document.hidden || $('tab-payments').hidden) unseen += added.length;
        updateBadge();
      }
    }
    knownIds = new Set(payments.map((p) => p.id));
    renderStats();
    renderRows();
  }

  function renderStats() {
    const now = new Date();
    const counted = payments.filter((p) => p.status !== 'blocked');
    const today = counted.filter((p) => sameDay(new Date(p.createdAt), now));
    const sum = (list) => list.reduce((t, p) => t + Number(p.amount), 0);
    const plural = (n) => `${n} payment${n === 1 ? '' : 's'}`;
    $('s-today-amt').textContent = inr(sum(today));
    $('s-today-count').textContent = plural(today.length);
    $('s-all-amt').textContent = inr(sum(counted));
    $('s-all-count').textContent = `${plural(counted.length)} (blocked not counted)`;
    $('s-new').textContent = payments.filter((p) => p.status === 'new').length;
    $('s-downloads').textContent = payments.reduce((t, p) => t + p.downloads, 0);
  }

  function renderRows() {
    const q = $('search').value.trim().toLowerCase();
    const list = payments.filter(
      (p) =>
        (filter === 'all' || p.status === filter) &&
        (!q || [p.utr, p.name, p.phone].some((v) => String(v || '').toLowerCase().includes(q))),
    );
    const rows = list.map((p) =>
      h(
        'tr',
        { class: freshIds.has(p.id) ? 'fresh' : '' },
        h('td', { 'data-label': 'Date' }, when(p.createdAt)),
        h('td', { 'data-label': 'UTR' }, h('span', { class: 'utr', title: 'Click to copy', onclick: () => copy(p.utr) }, p.utr)),
        h(
          'td',
          { 'data-label': 'Buyer' },
          h('div', {}, p.name || h('span', { class: 'muted' }, '—'), p.phone ? h('div', { class: 'small muted' }, p.phone) : null),
        ),
        h('td', { 'data-label': 'Amount', class: 'num' }, inr(p.amount)),
        h('td', { 'data-label': 'Downloads', class: 'num', title: p.lastDownloadAt ? `Last: ${when(p.lastDownloadAt)}` : '' }, String(p.downloads)),
        h('td', { 'data-label': 'Status' }, h('span', { class: `pill ${p.status}` }, STATUS_LABEL[p.status])),
        h('td', { class: 'actions-cell' }, h('div', { class: 'actions' }, actionsFor(p))),
      ),
    );
    $('rows').replaceChildren(...rows);
    $('empty').hidden = list.length > 0;
    $('empty').textContent = payments.length
      ? 'No payments match this search.'
      : 'No payments yet. They appear here as soon as a buyer submits a UTR.';
    freshIds = new Set();
  }

  function actionsFor(p) {
    const btn = (label, cls, fn) => h('button', { type: 'button', class: `btn sm ${cls}`, onclick: fn }, label);
    const out = [];
    if (p.status === 'new') out.push(btn('✓ Received', 'ghost', () => setStatus(p, 'received')));
    if (p.status === 'received') out.push(btn('Undo', 'ghost', () => setStatus(p, 'new')));
    if (p.status === 'blocked') out.push(btn('Unblock', 'ghost', () => setStatus(p, 'new')));
    else out.push(btn('Block', 'danger', () => setStatus(p, 'blocked')));
    out.push(btn('Delete', 'danger', () => remove(p)));
    return out;
  }

  async function setStatus(p, status) {
    if (status === 'blocked' && !confirm(`Block UTR ${p.utr}? The buyer's download link will stop working.`)) return;
    try {
      const updated = await api(`/api/admin/payments/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      Object.assign(p, updated);
      renderStats();
      renderRows();
    } catch (e) {
      toast(e.message);
    }
  }

  async function remove(p) {
    if (!confirm(`Delete the entry for UTR ${p.utr}? This also stops its download link. Use this for test entries.`)) return;
    try {
      await api(`/api/admin/payments/${p.id}`, { method: 'DELETE' });
      payments = payments.filter((x) => x.id !== p.id);
      knownIds.delete(p.id);
      renderStats();
      renderRows();
    } catch (e) {
      toast(e.message);
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`Copied ${text}`);
    } catch {
      /* ignore */
    }
  }

  $('search').addEventListener('input', renderRows);
  $('filters').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-filter]');
    if (!chip) return;
    filter = chip.dataset.filter;
    document.querySelectorAll('#filters .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    renderRows();
  });

  // ---------- settings ----------

  const FIELDS = ['productName', 'description', 'amount', 'note', 'upiId', 'payeeName'];

  async function loadSettings() {
    renderSettings(await api('/api/admin/settings'));
  }

  function renderSettings(s) {
    settings = s;
    for (const f of FIELDS) $(`f-${f}`).value = s[f] ?? '';

    $('setup-banner').hidden = s.problems.length === 0;
    $('setup-list').replaceChildren(...s.problems.map((p) => h('li', {}, p)));

    if (s.file) {
      const ext = (s.file.name.split('.').pop() || 'file').slice(0, 4).toUpperCase();
      $('file-ext').textContent = s.file.name.includes('.') ? ext : 'FILE';
      $('file-name').textContent = s.file.name;
      $('file-meta').textContent = `${size(s.file.size)} · uploaded ${when(s.file.uploadedAt)}`;
      $('file-check').hidden = false;
    } else {
      $('file-ext').textContent = 'FILE';
      $('file-name').textContent = 'No file yet';
      $('file-meta').textContent = 'Upload the file buyers get after paying.';
      $('file-check').hidden = true;
    }
    $('file-hint').textContent = `Uploading a new file replaces the old one for everyone, including earlier buyers. Max ${s.maxFileMb} MB.`;

    $('qr-preview').src = s.qrUrl || '';
    $('qr-preview').closest('.qr-preview').hidden = !s.qrUrl;
    $('qr-remove').hidden = !s.customQr;
    $('qr-mode').textContent = s.customQr
      ? `Showing your uploaded scanner image. If you change the price, upload a new scanner with that amount, or press “Use auto QR” to show a QR made from your UPI ID with the price filled in.`
      : `Showing a QR made from your UPI ID with ${inr(s.amount)} filled in. It updates by itself when you change the price.`;
  }

  $('settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const err = $('settings-error');
    err.hidden = true;
    const body = Object.fromEntries(FIELDS.map((f) => [f, $(`f-${f}`).value]));
    try {
      renderSettings(await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) }));
      toast('Settings saved');
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    }
  });

  function upload(url, field, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        let body = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        if (xhr.status === 401) showLogin();
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body.error || 'Upload failed.'));
      };
      xhr.onerror = () => reject(new Error('Network error during upload.'));
      const form = new FormData();
      form.append(field, file);
      xhr.send(form);
    });
  }

  $('file-input').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (settings?.file && !confirm(`Replace “${settings.file.name}” with “${file.name}”?`)) return;
    const bar = $('file-progress');
    bar.hidden = false;
    bar.firstElementChild.style.width = '0%';
    try {
      renderSettings(await upload('/api/admin/file', 'file', file, (f) => (bar.firstElementChild.style.width = `${Math.round(f * 100)}%`)));
      toast('File uploaded');
    } catch (e) {
      toast(e.message);
    } finally {
      bar.hidden = true;
    }
  });

  $('qr-input').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      renderSettings(await upload('/api/admin/qr', 'qr', file, () => {}));
      toast('Scanner image updated');
    } catch (e) {
      toast(e.message);
    }
  });

  $('qr-remove').addEventListener('click', async () => {
    if (!confirm('Stop using your uploaded scanner image and show a QR made from your UPI ID instead?')) return;
    try {
      renderSettings(await api('/api/admin/qr', { method: 'DELETE' }));
      toast('Now showing the auto QR');
    } catch (e) {
      toast(e.message);
    }
  });

  // ---------- start ----------

  fetch('/api/admin/session', { cache: 'no-store' })
    .then((res) => (res.ok ? showApp() : showLogin()))
    .catch(showLogin);
})();
