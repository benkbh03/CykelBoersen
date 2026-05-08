/* ============================================================
   FORHANDLER-UDVIDELSER
   - Åbningstider (opening_hours JSONB)
   - Website + sociale links
   - Services-chips
   - Følg forhandler (dealer_followers)
   ============================================================ */

import { esc } from './utils.js';

export const DAYS = [
  { key: 'mon', label: 'Man' },
  { key: 'tue', label: 'Tir' },
  { key: 'wed', label: 'Ons' },
  { key: 'thu', label: 'Tor' },
  { key: 'fri', label: 'Fre' },
  { key: 'sat', label: 'Lør' },
  { key: 'sun', label: 'Søn' },
];

export const SERVICES = [
  { key: 'reparation', label: 'Reparation',         icon: '🔧' },
  { key: 'custombyg',  label: 'Custom-byg',         icon: '⚙️' },
  { key: 'leasing',    label: 'Leasing/abonnement', icon: '📋' },
  { key: 'afhentning', label: 'Afhentning',         icon: '🏪' },
  { key: 'levering',   label: 'Levering',           icon: '🚚' },
  { key: 'tradein',    label: 'Trade-in',           icon: '↻'  },
];

export function defaultOpeningHours() {
  return {
    mon: { open: '10:00', close: '17:30', closed: false },
    tue: { open: '10:00', close: '17:30', closed: false },
    wed: { open: '10:00', close: '17:30', closed: false },
    thu: { open: '10:00', close: '18:00', closed: false },
    fri: { open: '10:00', close: '18:00', closed: false },
    sat: { open: '10:00', close: '14:00', closed: false },
    sun: { open: '',      close: '',      closed: true  },
  };
}

function dayKeyForDate(d) {
  // JS: 0=Søndag, 1=Mandag,...; vores DAYS-array starter på mandag
  return ['sun','mon','tue','wed','thu','fri','sat'][d.getDay()];
}

function parseHHMM(str) {
  if (!str || !/^\d{1,2}:\d{2}$/.test(str)) return null;
  const [h, m] = str.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Returnerer { isOpen: boolean, label: string } baseret på åbningstider. */
export function openStatus(hours, now = new Date()) {
  if (!hours || typeof hours !== 'object') return null;
  const todayKey = dayKeyForDate(now);
  const today = hours[todayKey];
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (today && !today.closed) {
    const o = parseHHMM(today.open);
    const c = parseHHMM(today.close);
    if (o !== null && c !== null && nowMin >= o && nowMin < c) {
      return { isOpen: true, label: `Åbent indtil ${today.close}` };
    }
    if (o !== null && nowMin < o) {
      return { isOpen: false, label: `Åbner kl. ${today.open}` };
    }
  }

  // Find næste åbningsdag inden for 7 dage
  const order = ['mon','tue','wed','thu','fri','sat','sun'];
  const todayIdx = order.indexOf(todayKey);
  for (let i = 1; i <= 7; i++) {
    const k = order[(todayIdx + i) % 7];
    const day = hours[k];
    if (day && !day.closed && parseHHMM(day.open) !== null) {
      const dayLabel = DAYS.find(d => d.key === k)?.label || '';
      return { isOpen: false, label: `Lukket · åbner ${dayLabel.toLowerCase()} kl. ${day.open}` };
    }
  }
  return { isOpen: false, label: 'Lukket' };
}

/** HTML-blok til editor i profil-modal. */
export function buildOpeningHoursEditor(hours) {
  const h = { ...defaultOpeningHours(), ...(hours || {}) };
  return `
    <div class="oh-editor">
      ${DAYS.map(({ key, label }) => {
        const d = h[key] || { open: '', close: '', closed: true };
        return `
          <div class="oh-row" data-day="${key}">
            <span class="oh-day">${label}</span>
            <label class="oh-closed-toggle">
              <input type="checkbox" data-oh-closed ${d.closed ? 'checked' : ''}>
              <span>Lukket</span>
            </label>
            <input type="time" class="oh-time" data-oh-open  value="${esc(d.open  || '')}" ${d.closed ? 'disabled' : ''}>
            <span class="oh-dash">–</span>
            <input type="time" class="oh-time" data-oh-close value="${esc(d.close || '')}" ${d.closed ? 'disabled' : ''}>
          </div>`;
      }).join('')}
    </div>`;
}

/** Læs åbningstider tilbage fra editor-DOM. */
export function readOpeningHoursFromDOM(rootEl) {
  if (!rootEl) return null;
  const out = {};
  rootEl.querySelectorAll('.oh-row').forEach(row => {
    const key    = row.dataset.day;
    const closed = row.querySelector('[data-oh-closed]')?.checked;
    const open   = row.querySelector('[data-oh-open]')?.value || '';
    const close  = row.querySelector('[data-oh-close]')?.value || '';
    out[key] = { open, close, closed: !!closed };
  });
  return out;
}

/** Init: bind closed-toggles til at disable/enable time-inputs. */
export function bindOpeningHoursEditor(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll('.oh-row').forEach(row => {
    const cb = row.querySelector('[data-oh-closed]');
    if (!cb) return;
    cb.onchange = () => {
      const dis = cb.checked;
      row.querySelectorAll('.oh-time').forEach(t => { t.disabled = dis; });
    };
  });
}

/** Visnings-HTML på dealer-profil (read-only). */
export function buildOpeningHoursDisplay(hours) {
  if (!hours || typeof hours !== 'object') return '';
  const status = openStatus(hours);
  const todayKey = dayKeyForDate(new Date());
  return `
    <div class="oh-display">
      <div class="oh-status ${status?.isOpen ? 'oh-open' : 'oh-closed'}">
        <span class="oh-status-dot"></span>
        <span>${esc(status?.label || '')}</span>
      </div>
      <details class="oh-details">
        <summary>Se alle åbningstider</summary>
        <div class="oh-list">
          ${DAYS.map(({ key, label }) => {
            const d = hours[key] || { closed: true };
            const isToday = key === todayKey;
            const text = d.closed
              ? '<span class="oh-list-closed">Lukket</span>'
              : `${esc(d.open || '')} – ${esc(d.close || '')}`;
            return `
              <div class="oh-list-row ${isToday ? 'oh-today' : ''}">
                <span class="oh-list-day">${label}${isToday ? ' (i dag)' : ''}</span>
                <span class="oh-list-time">${text}</span>
              </div>`;
          }).join('')}
        </div>
      </details>
    </div>`;
}

// ── Sociale links ────────────────────────────────────────────

function normalizeUrl(url) {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://' + trimmed;
}

export function buildSocialLinksDisplay({ website, facebook, instagram }) {
  const items = [];
  if (website) {
    items.push(`<a class="dealer-social-link" href="${esc(normalizeUrl(website))}" target="_blank" rel="noopener noreferrer nofollow" title="Besøg website">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      <span>Website</span>
    </a>`);
  }
  if (facebook) {
    items.push(`<a class="dealer-social-link" href="${esc(normalizeUrl(facebook))}" target="_blank" rel="noopener noreferrer nofollow" title="Facebook">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.3 0-1.7.8-1.7 1.6V12h2.9l-.5 2.9h-2.4v7A10 10 0 0 0 22 12z"/></svg>
      <span>Facebook</span>
    </a>`);
  }
  if (instagram) {
    items.push(`<a class="dealer-social-link" href="${esc(normalizeUrl(instagram))}" target="_blank" rel="noopener noreferrer nofollow" title="Instagram">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4z"/><line x1="17.5" y1="6.5" x2="17.5" y2="6.5"/></svg>
      <span>Instagram</span>
    </a>`);
  }
  if (!items.length) return '';
  return `<div class="dealer-social-links">${items.join('')}</div>`;
}

// ── Services-chips ───────────────────────────────────────────

export function buildServicesEditor(selected) {
  const set = new Set(Array.isArray(selected) ? selected : []);
  return `
    <div class="services-chips" id="services-chips">
      ${SERVICES.map(s => `
        <label class="service-chip ${set.has(s.key) ? 'on' : ''}">
          <input type="checkbox" value="${s.key}" ${set.has(s.key) ? 'checked' : ''}>
          <span>${s.icon} ${s.label}</span>
        </label>
      `).join('')}
    </div>`;
}

export function readServicesFromDOM(rootEl) {
  if (!rootEl) return [];
  const out = [];
  rootEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    if (cb.checked) out.push(cb.value);
  });
  return out;
}

export function bindServicesEditor(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll('.service-chip').forEach(label => {
    const cb = label.querySelector('input[type="checkbox"]');
    if (!cb) return;
    cb.onchange = () => label.classList.toggle('on', cb.checked);
  });
}

export function buildServicesDisplay(services) {
  if (!Array.isArray(services) || !services.length) return '';
  return `
    <div class="dealer-services">
      ${services.map(key => {
        const s = SERVICES.find(x => x.key === key);
        if (!s) return '';
        return `<span class="dealer-service-badge">${s.icon} ${esc(s.label)}</span>`;
      }).join('')}
    </div>`;
}

// ── Følg forhandler ──────────────────────────────────────────

export function createFollowDealer({ supabase, showToast, getCurrentUser, openLoginModal, navigateTo }) {
  async function isFollowing(dealerId) {
    const u = getCurrentUser();
    if (!u) return false;
    const { data } = await supabase
      .from('dealer_followers')
      .select('dealer_id')
      .eq('user_id', u.id)
      .eq('dealer_id', dealerId)
      .maybeSingle();
    return !!data;
  }

  async function getFollowerCount(dealerId) {
    const { count } = await supabase
      .from('dealer_followers')
      .select('dealer_id', { count: 'exact', head: true })
      .eq('dealer_id', dealerId);
    return count || 0;
  }

  async function toggleFollow(dealerId, btnEl) {
    const u = getCurrentUser();
    if (!u) {
      if (typeof openLoginModal === 'function') openLoginModal();
      return;
    }
    if (u.id === dealerId) {
      if (typeof showToast === 'function') showToast('Du kan ikke følge dig selv');
      return;
    }
    const wasFollowing = await isFollowing(dealerId);
    if (wasFollowing) {
      const { error } = await supabase
        .from('dealer_followers')
        .delete()
        .eq('user_id', u.id)
        .eq('dealer_id', dealerId);
      if (error) { showToast?.('❌ Kunne ikke afmelde'); return; }
      showToast?.('Du følger ikke længere denne forhandler');
    } else {
      const { error } = await supabase
        .from('dealer_followers')
        .insert({ user_id: u.id, dealer_id: dealerId });
      if (error) { showToast?.('❌ Kunne ikke følge forhandler'); return; }
      showToast?.('🔔 Du følger nu forhandleren');
    }
    if (btnEl) updateFollowButton(btnEl, !wasFollowing);
    return !wasFollowing;
  }

  function updateFollowButton(btnEl, following) {
    btnEl.classList.toggle('following', following);
    btnEl.innerHTML = following
      ? '<span class="follow-icon">✓</span> Følger'
      : '<span class="follow-icon">🔔</span> Følg';
  }

  function buildFollowButton(dealerId, following) {
    const cls = following ? 'pp-follow-btn following' : 'pp-follow-btn';
    const txt = following
      ? '<span class="follow-icon">✓</span> Følger'
      : '<span class="follow-icon">🔔</span> Følg';
    return `<button class="${cls}" onclick="toggleFollowDealer('${dealerId}', this)" data-dealer-id="${dealerId}">${txt}</button>`;
  }

  return { isFollowing, getFollowerCount, toggleFollow, updateFollowButton, buildFollowButton };
}
