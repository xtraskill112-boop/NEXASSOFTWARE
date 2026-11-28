(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const REFRESH_MS = 5000;
  const STATUS_LABEL = { new: 'Waiting', received: 'Received', blocked: 'Not received' };
  const SOUND_KEY = 'payAndDownload.adminSound';

  let payments = [];
  let links = [];
  let settings = null;
  let filter = 'all';
  let knownIds = null; // payment ids seen so far; null until the first load
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
  const linkUrl = (link) => `${location.origin}${link.path}`;
  const ago = (iso) => {
    const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
    return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h`;
  };

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
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
    toastTimer = setTimeout(() => (el.hidden = true), 3500);
  }

  async function copy(text, message = 'Copied') {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch {
      prompt('Copy this:', text);
    }
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

  function upload(url, field, file, onProgress = () => {}) {
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

  // ---------- sound ----------

  let audio = null;
  let soundOn = true;
  try {
    soundOn = localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    /* ignore */
  }

  function unlockAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch {
      /* no audio */
    }
  }
  // Browsers allow sound only after the page has been clicked once.
  document.addEventListener('pointerdown', unlockAudio, { once: true });

  function chime() {
    if (!soundOn || !audio) return;
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime;
    [880, 660, 880].forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.2 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.2 + 0.18);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + i * 0.2);
      osc.stop(t + i * 0.2 + 0.2);
    });
  }

  function renderSoundButton() {
    $('sound').textContent = soundOn ? '🔔 Sound on' : '🔕 Sound off';
    $('sound').setAttribute('aria-pressed', String(soundOn));
    $('sound').classList.toggle('sound-on', soundOn);
  }

  $('sound').addEventListener('click', () => {
    soundOn = !soundOn;
    try {
      localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    unlockAudio();
    renderSoundButton();
    if (soundOn) chime();
  });

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
    renderSoundButton();
    await Promise.all([loadSettings(), loadLinks(), loadPayments()]);
    clearInterval(timer);
    timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, REFRESH_MS);
  }

  async function refresh() {
    try {
      await Promise.all([loadPayments(), loadLinks()]);
    } catch {
      /* try again on the next tick */
    }
  }

  // Background tabs refresh less often; catch up as soon as the tab is visible again.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !$('app-view').hidden) refresh();
  });
  setInterval(() => {
    if (document.hidden && !$('app-view').hidden) loadPayments().catch(() => {});
  }, 15000);

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    unlockAudio();
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

  // ---------- tabs ----------

  const TABS = ['payments', 'links', 'settings'];
  function selectTab(name) {
    for (const t of TABS) {
      $(`tab-btn-${t}`).setAttribute('aria-selected', String(t === name));
      $(`tab-${t}`).hidden = t !== name;
    }
    if (name === 'payments') {
      unseen = 0;
      updateBadge();
    }
  }
  for (const t of TABS) $(`tab-btn-${t}`).addEventListener('click', () => selectTab(t));

  function updateBadge() {
    const waiting = payments.filter((p) => p.status === 'new').length;
    $('new-badge').hidden = waiting === 0;
    $('new-badge').textContent = waiting;
    document.title = waiting ? `(${waiting}) Payments Admin` : 'Payments Admin';
  }

  function renderBanner() {
    const problems = [];
    if (settings && !settings.upiId && links.some((l) => !l.customQr)) problems.push('Add your UPI ID in Settings so QR codes can be made.');
    if (links.length === 0) problems.push('Make your first payment link in the Links tab.');
    $('setup-banner').hidden = problems.length === 0;
    $('setup-list').replaceChildren(...problems.map((p) => h('li', {}, p)));
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
        toast(`New payment to check: ${inr(p.amount)} · UTR ${p.utr} · ${p.linkTitle}`);
        chime();
        if (document.hidden || $('tab-payments').hidden) unseen += added.length;
      }
    }
    knownIds = new Set(payments.map((p) => p.id));
    updateBadge();
    renderStats();
    renderRows();
  }

  function renderStats() {
    const now = new Date();
    const received = payments.filter((p) => p.status === 'received');
    const today = received.filter((p) => sameDay(new Date(p.receivedAt || p.createdAt), now));
    const sum = (list) => list.reduce((t, p) => t + Number(p.amount), 0);
    const plural = (n) => `${n} payment${n === 1 ? '' : 's'}`;
    const waiting = payments.filter((p) => p.status === 'new').length;
    $('s-waiting').textContent = waiting;
    $('stat-waiting').classList.toggle('alert', waiting > 0);
    $('s-today-amt').textContent = inr(sum(today));
    $('s-today-count').textContent = plural(today.length);
    $('s-all-amt').textContent = inr(sum(received));
    $('s-all-count').textContent = plural(received.length);
    $('s-downloads').textContent = payments.reduce((t, p) => t + p.downloads, 0);
  }

  function renderRows() {
    const q = $('search').value.trim().toLowerCase();
    const linkId = $('link-filter').value;
    const list = payments.filter(
      (p) =>
        (filter === 'all' || p.status === filter) &&
        (!linkId || p.linkId === linkId) &&
        (!q || [p.utr, p.name, p.phone].some((v) => String(v || '').toLowerCase().includes(q))),
    );
    const rows = list.map((p) =>
      h(
        'tr',
        { class: freshIds.has(p.id) ? 'fresh' : '' },
        h('td', { 'data-label': 'Date' }, when(p.createdAt)),
        h('td', { 'data-label': 'UTR' }, h('span', { class: 'utr', title: 'Click to copy', onclick: () => copy(p.utr, `Copied ${p.utr}`) }, p.utr)),
        h('td', { 'data-label': 'Link' }, p.linkTitle),
        h(
          'td',
          { 'data-label': 'Buyer' },
          h('div', {}, p.name || h('span', { class: 'muted' }, '—'), p.phone ? h('div', { class: 'small muted' }, p.phone) : null),
        ),
        h('td', { 'data-label': 'Amount', class: 'num' }, inr(p.amount)),
        h(
          'td',
          { 'data-label': 'Status' },
          h(
            'div',
            {},
            h('span', { class: `pill ${p.status}` }, STATUS_LABEL[p.status]),
            p.status === 'new' ? h('span', { class: 'waiting-for' }, `waiting ${ago(p.createdAt)}`) : null,
            p.status === 'received' && p.downloads ? h('span', { class: 'small muted', style: 'display:block' }, `${p.downloads} download${p.downloads === 1 ? '' : 's'}`) : null,
          ),
        ),
        h('td', { class: 'actions-cell' }, h('div', { class: 'actions' }, actionsFor(p))),
      ),
    );
    $('rows').replaceChildren(...rows);
    $('empty').hidden = list.length > 0;
    $('empty').textContent = payments.length
      ? 'No payments match.'
      : 'No payments yet. They appear here as soon as a buyer submits a UTR (with a sound).';
    freshIds = new Set();
  }

  function actionsFor(p) {
    const btn = (label, cls, fn) => h('button', { type: 'button', class: `btn sm ${cls}`, onclick: fn }, label);
    const out = [];
    if (p.status === 'new') {
      out.push(btn('✓ Received', 'success', () => setStatus(p, 'received')));
      out.push(btn('✗ Not received', 'danger', () => setStatus(p, 'blocked')));
    } else {
      out.push(btn('Undo', 'ghost', () => setStatus(p, 'new')));
    }
    out.push(btn('Delete', 'danger', () => remove(p)));
    return out;
  }

  async function setStatus(p, status) {
    if (status === 'blocked' && !confirm(`Mark UTR ${p.utr} as NOT received? The buyer will see "Payment not received".`)) return;
    if (status === 'new' && p.status === 'received' && !confirm(`Undo Received for UTR ${p.utr}? The buyer's download stops working.`)) return;
    try {
      const updated = await api(`/api/admin/payments/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      Object.assign(p, updated);
      updateBadge();
      renderStats();
      renderRows();
      if (status === 'received') toast(`Received ✓ — the buyer can download now (UTR ${p.utr})`);
    } catch (e) {
      toast(e.message);
    }
  }

  async function remove(p) {
    if (!confirm(`Delete the entry for UTR ${p.utr}? Its download link stops working. Use this for test entries.`)) return;
    try {
      await api(`/api/admin/payments/${p.id}`, { method: 'DELETE' });
      payments = payments.filter((x) => x.id !== p.id);
      knownIds.delete(p.id);
      updateBadge();
      renderStats();
      renderRows();
    } catch (e) {
      toast(e.message);
    }
  }

  $('search').addEventListener('input', renderRows);
  $('link-filter').addEventListener('change', renderRows);
  $('filters').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-filter]');
    if (!chip) return;
    filter = chip.dataset.filter;
    document.querySelectorAll('#filters .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    renderRows();
  });

  // ---------- links ----------

  async function loadLinks() {
    const data = await api('/api/admin/links');
    links = data.links;
    renderLinks();
    renderLinkSelects();
    renderBanner();
  }

  function renderLinkSelects() {
    const keep = $('link-filter').value;
    $('link-filter').replaceChildren(h('option', { value: '' }, 'All links'), ...links.map((l) => h('option', { value: l.id }, l.title)));
    $('link-filter').value = links.some((l) => l.id === keep) ? keep : '';
    if (settings) renderHomeSelect();
  }

  let flashId = null;
  // Redrawn on every refresh (for the counts); the editor is outside the list, so typing isn't disturbed.
  function renderLinks() {
    $('links-empty').hidden = links.length > 0;
    $('link-list').replaceChildren(...links.map(linkCard));
    flashId = null;
  }

  function linkCard(link) {
    const url = linkUrl(link);
    const s = link.stats;
    const share = `${link.title} — ${inr(link.amount)}\nPay and download here: ${url}`;
    return h(
      'article',
      { class: `link-card${link.active ? '' : ' paused'}${flashId === link.id ? ' flash' : ''}`, id: `link-${link.id}` },
      h(
        'div',
        { class: 'link-top' },
        h('h3', {}, link.title),
        h('span', { class: 'link-price' }, inr(link.amount)),
      ),
      h(
        'div',
        { class: 'link-meta' },
        h('span', { class: `pill ${link.active ? 'received' : 'paused'}` }, link.active ? 'Active' : 'Paused'),
        link.isHome ? h('span', { class: 'pill home' }, 'Home page') : null,
        s.waiting ? h('span', { class: 'pill new' }, `${s.waiting} waiting`) : null,
      ),
      h(
        'div',
        { class: 'link-url' },
        h('code', {}, url),
        h('button', { type: 'button', class: 'btn primary sm', onclick: () => copy(url, 'Link copied — send it to the buyer') }, 'Copy link'),
        h('a', { class: 'btn ghost sm', href: `https://wa.me/?text=${encodeURIComponent(share)}`, target: '_blank', rel: 'noopener' }, 'WhatsApp'),
        h('a', { class: 'btn ghost sm', href: link.path, target: '_blank', rel: 'noopener' }, 'Open ↗'),
      ),
      h(
        'div',
        { class: 'link-info' },
        link.file
          ? h('div', {}, '📄 ', link.file.name, ` · ${size(link.file.size)}`)
          : h('div', { class: 'warn' }, '⚠ No file yet — buyers see "Coming soon".'),
        link.problems.filter((p) => !p.startsWith('Upload the file')).map((p) => h('div', { class: 'warn' }, `⚠ ${p}`)),
        h('div', {}, `${s.payments} payment${s.payments === 1 ? '' : 's'} · ${s.received} received · ${inr(s.receivedAmount)}`),
      ),
      h(
        'div',
        { class: 'link-actions' },
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => openEditor(link) }, 'Edit'),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => showPaymentsOf(link) }, 'Payments'),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => toggleActive(link) }, link.active ? 'Pause' : 'Resume'),
        h('button', { type: 'button', class: 'btn danger sm', onclick: () => deleteLink(link) }, 'Delete'),
      ),
    );
  }

  function showPaymentsOf(link) {
    $('link-filter').value = link.id;
    selectTab('payments');
    renderRows();
  }

  async function toggleActive(link) {
    try {
      await api(`/api/admin/links/${link.id}`, { method: 'PUT', body: JSON.stringify({ active: !link.active }) });
      await loadLinks();
      toast(link.active ? 'Link paused — buyers can no longer pay on it' : 'Link active again');
    } catch (e) {
      toast(e.message);
    }
  }

  async function deleteLink(link) {
    if (!confirm(`Delete the link "${link.title}"? It stops working and its file is removed. Its payments stay in the list.`)) return;
    try {
      await api(`/api/admin/links/${link.id}`, { method: 'DELETE' });
      if (editing && editing.id === link.id) closeEditor();
      await Promise.all([loadLinks(), loadSettings()]);
      toast('Link deleted');
    } catch (e) {
      toast(e.message);
    }
  }

  // ----- editor (new / edit) -----

  let editing = null; // the link being edited, or null for a new one
  let pendingFile = null;
  let pendingQr = null;

  function renderEditorFile() {
    const file = pendingFile ? { name: pendingFile.name, size: pendingFile.size } : editing && editing.file;
    const ext = file && file.name.includes('.') ? file.name.split('.').pop().slice(0, 4).toUpperCase() : 'FILE';
    $('e-file-ext').textContent = ext;
    $('e-file-name').textContent = file ? file.name : 'No file yet';
    $('e-file-meta').textContent = pendingFile
      ? `${size(pendingFile.size)} · uploads when you save`
      : file
        ? `${size(file.size)} · uploaded ${when(file.uploadedAt)}`
        : `Choose the file for this link (max ${settings ? settings.maxFileMb : 25} MB).`;
    $('e-file-check').hidden = !(editing && editing.file) || Boolean(pendingFile);
    if (editing) $('e-file-check').href = `/api/admin/links/${editing.id}/file`;

    $('e-qr-remove').hidden = !(editing && editing.customQr) || Boolean(pendingQr);
    $('e-qr-mode').textContent = pendingQr
      ? `Your scanner image "${pendingQr.name}" uploads when you save. Make sure its amount matches the price.`
      : editing && editing.customQr
        ? 'Showing your uploaded scanner image. If you change the price, upload a new scanner or use the auto QR.'
        : "A QR is made from your UPI ID with this link's price filled in (recommended).";
  }

  function openEditor(link = null) {
    editing = link;
    pendingFile = null;
    pendingQr = null;
    $('editor-title').textContent = link ? `Edit “${link.title}”` : 'New link';
    $('editor-save').textContent = link ? 'Save changes' : 'Create link';
    $('e-title').value = link ? link.title : '';
    $('e-amount').value = link ? link.amount : '';
    $('e-description').value = link ? link.description : '';
    $('e-note').value = link ? link.note : '';
    $('e-active-row').hidden = !link;
    $('e-active').checked = link ? link.active : true;
    $('editor-error').hidden = true;
    renderEditorFile();
    $('editor').hidden = false;
    selectTab('links');
    $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('e-title').focus({ preventScroll: true });
  }

  function closeEditor() {
    editing = null;
    pendingFile = null;
    pendingQr = null;
    $('editor').hidden = true;
  }

  $('new-link').addEventListener('click', () => openEditor(null));
  $('editor-cancel').addEventListener('click', closeEditor);
  $('e-file').addEventListener('change', (event) => {
    pendingFile = event.target.files[0] || pendingFile;
    event.target.value = '';
    renderEditorFile();
  });
  $('e-qr').addEventListener('change', (event) => {
    pendingQr = event.target.files[0] || pendingQr;
    event.target.value = '';
    renderEditorFile();
  });
  $('e-qr-remove').addEventListener('click', async () => {
    if (!editing || !confirm('Stop using your uploaded scanner image and show a QR made from your UPI ID with the price filled in?')) return;
    try {
      editing = await api(`/api/admin/links/${editing.id}/qr`, { method: 'DELETE' });
      renderEditorFile();
      await loadLinks();
      toast('Now showing the auto QR');
    } catch (e) {
      toast(e.message);
    }
  });

  $('editor').addEventListener('submit', async (event) => {
    event.preventDefault();
    const err = $('editor-error');
    err.hidden = true;
    if (!editing && !pendingFile) {
      err.textContent = 'Choose the file the buyer gets.';
      err.hidden = false;
      return;
    }
    const body = {
      title: $('e-title').value,
      amount: $('e-amount').value,
      description: $('e-description').value,
      note: $('e-note').value,
    };
    if (editing) body.active = $('e-active').checked;
    const save = $('editor-save');
    const label = save.textContent;
    save.disabled = true;
    save.textContent = 'Saving…';
    const created = !editing;
    try {
      let link = editing
        ? await api(`/api/admin/links/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await api('/api/admin/links', { method: 'POST', body: JSON.stringify(body) });
      editing = link; // a failed upload below can be retried without making a second link
      if (pendingFile) {
        const bar = $('e-progress');
        bar.hidden = false;
        try {
          link = await upload(`/api/admin/links/${link.id}/file`, 'file', pendingFile, (f) => (bar.firstElementChild.style.width = `${Math.round(f * 100)}%`));
        } finally {
          bar.hidden = true;
          bar.firstElementChild.style.width = '0%';
        }
        pendingFile = null;
        editing = link;
      }
      if (pendingQr) {
        link = await upload(`/api/admin/links/${link.id}/qr`, 'qr', pendingQr);
        pendingQr = null;
        editing = link;
      }
      closeEditor();
      flashId = link.id;
      await loadLinks();
      document.getElementById(`link-${link.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (created) {
        toast('Link ready — click Copy link and send it to the buyer');
      } else {
        toast('Link saved');
      }
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      renderEditorFile();
      $('editor-title').textContent = editing ? `Edit “${editing.title}”` : 'New link';
      $('editor-save').textContent = editing ? 'Save changes' : 'Create link';
      $('e-active-row').hidden = !editing;
      await loadLinks().catch(() => {});
      return;
    } finally {
      save.disabled = false;
      if (save.textContent === 'Saving…') save.textContent = label;
    }
  });

  // ---------- settings ----------

  async function loadSettings() {
    settings = await api('/api/admin/settings');
    $('f-upiId').value = settings.upiId || '';
    $('f-payeeName').value = settings.payeeName || '';
    $('home-url').textContent = `${location.origin}/`;
    renderHomeSelect();
    renderBanner();
  }

  function renderHomeSelect() {
    $('f-homeLinkId').replaceChildren(
      h('option', { value: '' }, 'Nothing — "Open your payment link" notice'),
      ...links.map((l) => h('option', { value: l.id }, `${l.title} (${inr(l.amount)})`)),
    );
    $('f-homeLinkId').value = settings.homeLinkId || '';
  }

  $('settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const err = $('settings-error');
    err.hidden = true;
    try {
      settings = await api('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ upiId: $('f-upiId').value, payeeName: $('f-payeeName').value, homeLinkId: $('f-homeLinkId').value }),
      });
      await loadLinks();
      toast('Settings saved');
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    }
  });

  // ---------- start ----------

  fetch('/api/admin/session', { cache: 'no-store' })
    .then((res) => (res.ok ? showApp() : showLogin()))
    .catch(showLogin);
})();
