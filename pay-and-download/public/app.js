(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const all = (selector) => document.querySelectorAll(selector);
  const code = decodeURIComponent(location.pathname.split('/')[2] || '');
  const TOKEN_KEY = `payAndDownload.${code}`;
  const POLL_MS = 4000;

  const store = {
    get() {
      try {
        return localStorage.getItem(TOKEN_KEY);
      } catch {
        return null;
      }
    },
    set(value) {
      try {
        localStorage.setItem(TOKEN_KEY, value);
      } catch {
        /* private mode: the status still updates while the page stays open */
      }
    },
    clear() {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {
        /* ignore */
      }
    },
  };

  const inr = (n) =>
    Number(n).toLocaleString('en-IN', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const when = (iso) =>
    new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  let toastTimer;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2200);
  }

  // ---------- steps ----------

  const STEP_OF = { 'step-pay': 1, 'step-utr': 2, 'step-checking': 3, 'step-done': 4, 'step-rejected': 3 };

  function showStep(id) {
    for (const s of Object.keys(STEP_OF)) $(s).hidden = s !== id;
    const n = STEP_OF[id];
    all('.steps li').forEach((li) => {
      const s = Number(li.dataset.step);
      li.classList.toggle('done', s < n || id === 'step-done');
      li.classList.toggle('current', s === n && id !== 'step-done');
      li.classList.toggle('failed', s === n && id === 'step-rejected');
      if (s === n) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    // Leaving the page while it is being checked would lose sight of the result.
    window.onbeforeunload = id === 'step-checking' ? (e) => (e.preventDefault(), (e.returnValue = '')) : null;
  }

  function fillHeader(title, amount, description = '') {
    document.title = `${title} · Pay ₹${inr(amount)}`;
    $('product-name').textContent = title;
    $('product-desc').textContent = description;
    $('product-desc').hidden = !description;
    $('price').textContent = inr(amount);
    all('.amount').forEach((el) => (el.textContent = inr(amount)));
  }

  function fillReceipt(p) {
    all('.r-amount').forEach((el) => (el.textContent = inr(p.amount)));
    all('.r-utr').forEach((el) => (el.textContent = p.utr));
    all('.r-date').forEach((el) => (el.textContent = when(p.createdAt)));
  }

  // ---------- checking: countdown + polling ----------

  let pollTimer = null;
  let tickTimer = null;
  let deadline = 0;
  let currentToken = null;

  function startCountdown(p) {
    const total = p.checkSeconds || 120;
    deadline = Date.now() + Math.max(0, total - (p.elapsedSeconds || 0)) * 1000;
    const ring = $('ring');
    const length = 2 * Math.PI * 52;
    ring.style.strokeDasharray = String(length);
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      $('seconds').textContent = left;
      $('wait-seconds').textContent = left || total;
      $('wait-seconds-hi').textContent = left || total;
      ring.style.strokeDashoffset = String(length * (1 - left / total));
      $('checking-text').hidden = left === 0;
      $('checking-late').hidden = left !== 0;
      if (left === 0) clearInterval(tickTimer);
    };
    clearInterval(tickTimer);
    tick();
    tickTimer = setInterval(tick, 1000);
  }

  function stopChecking() {
    clearTimeout(pollTimer);
    clearInterval(tickTimer);
    pollTimer = null;
  }

  async function poll() {
    if (!currentToken) return;
    try {
      const res = await fetch(`/api/payments/${encodeURIComponent(currentToken)}`, { cache: 'no-store' });
      if (res.status === 404) {
        store.clear();
        stopChecking();
        showStep('step-pay');
        return;
      }
      if (res.ok) {
        const p = await res.json();
        if (p.status !== 'new') return showPayment(p, true);
      }
    } catch {
      /* offline for a moment: keep trying */
    }
    pollTimer = setTimeout(poll, document.hidden ? POLL_MS * 3 : POLL_MS);
  }

  function chime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.32);
      });
    } catch {
      /* no sound available */
    }
    if (navigator.vibrate) navigator.vibrate(200);
  }

  /** Shows a submitted payment in whatever state it is in. */
  function showPayment(p, changed = false) {
    currentToken = p.token;
    fillReceipt(p);
    if (p.status === 'new') {
      showStep('step-checking');
      startCountdown(p);
      clearTimeout(pollTimer);
      pollTimer = setTimeout(poll, POLL_MS);
      return;
    }
    stopChecking();
    if (p.status === 'received') {
      $('download').href = p.downloadUrl;
      $('file-name').textContent = p.fileName || '';
      showStep('step-done');
      if (changed) chime();
    } else {
      showStep('step-rejected');
    }
    if (changed) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && pollTimer) {
      clearTimeout(pollTimer);
      poll();
    }
  });

  // ---------- start ----------

  async function init() {
    let link = null;
    let linkStatus = 0;
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(code)}`, { cache: 'no-store' });
      linkStatus = res.status;
      if (res.ok) link = await res.json();
    } catch {
      $('loading').textContent = 'Could not load the page. Check your internet and refresh.';
      return;
    }

    // A buyer who already submitted a UTR on this phone sees its status, even if the link was paused.
    const saved = store.get();
    let payment = null;
    if (saved) {
      try {
        const res = await fetch(`/api/payments/${encodeURIComponent(saved)}`, { cache: 'no-store' });
        if (res.ok) payment = await res.json();
        else if (res.status === 404) store.clear();
      } catch {
        /* ignore */
      }
    }

    $('loading').hidden = true;

    if (!link && !payment) {
      if (linkStatus !== 404) $('unavailable-text').textContent = 'Could not load the page. Please refresh.';
      $('unavailable').hidden = false;
      return;
    }
    if (link && !link.ready && !payment) {
      $('unavailable-title').textContent = 'Coming soon';
      $('unavailable-text').textContent = 'This payment page is not ready yet. Please check back later.';
      $('unavailable').hidden = false;
      return;
    }

    if (link) {
      fillHeader(link.title, link.amount, link.description);
      if (link.qrUrl) $('qr').src = link.qrUrl;
      else $('qr').closest('.qr-box').hidden = true;
      if (link.upiId) {
        $('upi-id').textContent = link.upiId;
        $('payee').textContent = link.payeeName || '';
      } else {
        $('upi-row').hidden = true;
      }
      // Phones open the UPI app directly; on a computer the QR code is the way to pay.
      const isPhone = window.matchMedia('(pointer: coarse)').matches && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (link.upiLink && isPhone) {
        $('pay-app').href = link.upiLink;
        $('pay-app').hidden = false;
        $('paid').classList.replace('primary', 'ghost');
      }
    } else {
      fillHeader(payment.title, payment.amount);
    }

    $('flow').hidden = false;
    if (payment) showPayment(payment);
    else showStep('step-pay');
  }

  // ---------- events ----------

  $('copy-upi').addEventListener('click', async () => {
    const text = $('upi-id').textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('upi-id'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('copy');
      sel.removeAllRanges();
    }
    toast('UPI ID copied');
  });

  $('paid').addEventListener('click', () => {
    showStep('step-utr');
    $('utr').focus();
  });

  $('back').addEventListener('click', () => showStep('step-pay'));

  const utrInput = $('utr');
  utrInput.addEventListener('input', () => {
    const digits = utrInput.value.replace(/\D/g, '').slice(0, 12);
    if (utrInput.value !== digits) utrInput.value = digits;
    $('utr-count').textContent = `${digits.length}/12`;
    $('utr-error').hidden = true;
  });

  $('step-utr').addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = $('utr-error');
    const utr = utrInput.value.replace(/\D/g, '');
    if (utr.length !== 12) {
      error.textContent = 'Enter the full 12-digit UTR number. · पूरा 12 अंकों का UTR नंबर डालें।';
      error.hidden = false;
      utrInput.focus();
      return;
    }
    const button = $('submit');
    button.disabled = true;
    button.textContent = 'Submitting…';
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(code)}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utr, name: $('name').value, phone: $('phone').value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not submit. Please try again.');
      store.set(body.token);
      showPayment(body, true);
    } catch (err) {
      error.textContent = err.message === 'Failed to fetch' ? 'No internet connection. Please try again.' : err.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'Submit';
    }
  });

  $('retry').addEventListener('click', () => {
    store.clear();
    currentToken = null;
    utrInput.value = '';
    $('utr-count').textContent = '0/12';
    showStep('step-utr');
    utrInput.focus();
  });

  init();
})();
