(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = 'payAndDownload.token';
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
        /* private mode: the download still works on this visit */
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

  function showStep(n) {
    for (const i of [1, 2, 3]) $(`step-${i}`).hidden = i !== n;
    document.querySelectorAll('.steps li').forEach((li) => {
      const s = Number(li.dataset.step);
      li.classList.toggle('done', s < n || n === 3);
      li.classList.toggle('current', s === n);
      if (s === n) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }

  function showSuccess(payment) {
    $('r-amount').textContent = inr(payment.amount);
    $('r-utr').textContent = payment.utr;
    $('r-date').textContent = when(payment.createdAt);
    $('download').href = payment.downloadUrl;
    $('download').hidden = payment.blocked;
    $('blocked').hidden = !payment.blocked;
    $('file-name').textContent = payment.fileName && !payment.blocked ? payment.fileName : '';
    showStep(3);
  }

  async function init() {
    let config;
    try {
      const res = await fetch('/api/config', { cache: 'no-store' });
      config = await res.json();
    } catch {
      $('loading').textContent = 'Could not load the page. Check your internet and refresh.';
      return;
    }
    $('loading').hidden = true;

    if (!config.ready) {
      $('unavailable').hidden = false;
      return;
    }

    document.title = `${config.productName} · Pay ₹${inr(config.amount)}`;
    $('product-name').textContent = config.productName;
    $('product-desc').textContent = config.description || '';
    $('product-desc').hidden = !config.description;
    $('price').textContent = inr(config.amount);
    document.querySelectorAll('.amount').forEach((el) => (el.textContent = inr(config.amount)));
    if (config.qrUrl) $('qr').src = config.qrUrl;
    else $('qr').closest('.qr-box').hidden = true;

    if (config.upiId) {
      $('upi-id').textContent = config.upiId;
      $('payee').textContent = config.payeeName || '';
    } else {
      $('upi-row').hidden = true;
    }

    // Phones open the UPI app directly; on a computer the QR code is the way to pay.
    const isPhone = window.matchMedia('(pointer: coarse)').matches && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (config.upiLink && isPhone) {
      $('pay-app').href = config.upiLink;
      $('pay-app').hidden = false;
      $('paid').classList.replace('primary', 'ghost');
    }

    $('flow').hidden = false;

    const saved = store.get();
    if (saved) {
      try {
        const res = await fetch(`/api/payments/${encodeURIComponent(saved)}`, { cache: 'no-store' });
        if (res.ok) {
          showSuccess(await res.json());
          return;
        }
        if (res.status === 404) store.clear();
      } catch {
        /* fall through to the payment step */
      }
    }
    showStep(1);
  }

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
    showStep(2);
    $('utr').focus();
  });

  $('back').addEventListener('click', () => showStep(1));

  const utrInput = $('utr');
  utrInput.addEventListener('input', () => {
    const digits = utrInput.value.replace(/\D/g, '').slice(0, 12);
    if (utrInput.value !== digits) utrInput.value = digits;
    $('utr-count').textContent = `${digits.length}/12`;
    $('utr-error').hidden = true;
  });

  $('step-2').addEventListener('submit', async (event) => {
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
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utr, name: $('name').value, phone: $('phone').value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not submit. Please try again.');
      store.set(body.token);
      showSuccess(body);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      error.textContent = err.message === 'Failed to fetch' ? 'No internet connection. Please try again.' : err.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'Submit';
    }
  });

  $('restart').addEventListener('click', () => {
    store.clear();
    utrInput.value = '';
    $('utr-count').textContent = '0/12';
    showStep(1);
  });

  init();
})();
