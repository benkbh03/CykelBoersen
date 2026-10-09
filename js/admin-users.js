/* Admin: fanen Brugere. Søgning, sortering, filtrering og en detaljevisning
   pr. bruger med annoncer, modtagne vurderinger og moderationshistorik.

   main.js henter stadig profilerne (loadAllUsers) og ejer knapperne
   (suspendér, slet, verificér), fordi de kaldes via onclick. Denne fil får
   rækkerne og en funktion der tegner én række, og står for resten.

   Alt her er læsning. Skrivninger går stadig gennem admin-actions-functionen,
   så rettighederne håndhæves server-side, ikke af denne fil.

   Ny fil med vilje: se cache-reglen i CLAUDE.md. */

const ACTION_LABELS = {
  suspend_user:   'Suspenderet',
  unsuspend_user: 'Suspendering ophævet',
  delete_user:    'Slettet',
  approve_dealer: 'Forhandler godkendt',
  reject_dealer:  'Forhandleransøgning afvist',
  revoke_dealer:  'Verificering fjernet',
};

const SORTS = {
  newest:   (a, b) => cmpDate(b.created_at, a.created_at),
  oldest:   (a, b) => cmpDate(a.created_at, b.created_at),
  seen:     (a, b) => cmpDate(b.last_seen, a.last_seen),
  name:     (a, b) => displayName(a).localeCompare(displayName(b), 'da'),
};

function cmpDate(x, y) {
  return (x ? Date.parse(x) : 0) - (y ? Date.parse(y) : 0);
}

function displayName(p) {
  return (p.shop_name || p.name || '').trim();
}

function isSuspended(p) {
  return !!p._susp_until && new Date(p._susp_until) > new Date();
}

function fmtDate(d) {
  if (!d) return '–';
  return new Date(d).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function createAdminUsers({ supabase, esc, retryHTML, formatLastSeen }) {
  let _rows = [];
  let _rowHtml = () => '';
  let _state = { q: '', sort: 'newest', kind: 'all' };
  let _openId = null;

  function setUsers(rows, rowHtml) {
    _rows = rows || [];
    _rowHtml = rowHtml;
    const host = document.getElementById('admin-users-list');
    if (!host) return;
    host.innerHTML = toolbarHTML() + '<div id="admin-users-rows"></div>';
    const input = document.getElementById('admin-users-q');
    input.addEventListener('input', () => { _state.q = input.value; renderRows(); });
    document.getElementById('admin-users-sort').addEventListener('change', (e) => { _state.sort = e.target.value; renderRows(); });
    document.getElementById('admin-users-kind').addEventListener('change', (e) => { _state.kind = e.target.value; renderRows(); });
    document.getElementById('admin-users-rows').addEventListener('click', onRowsClick);
    renderRows();
  }

  function toolbarHTML() {
    const opt = (v, label, cur) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + label + '</option>';
    return '<div class="admin-users-toolbar">'
      + '<input type="search" id="admin-users-q" class="admin-users-q" placeholder="Søg på navn, butik, e-mail eller by" value="' + esc(_state.q) + '" aria-label="Søg i brugere">'
      + '<select id="admin-users-kind" aria-label="Vis">'
      +   opt('all', 'Alle', _state.kind) + opt('private', 'Private', _state.kind)
      +   opt('dealer', 'Forhandlere', _state.kind) + opt('suspended', 'Suspenderede', _state.kind)
      + '</select>'
      + '<select id="admin-users-sort" aria-label="Sortér">'
      +   opt('newest', 'Nyeste først', _state.sort) + opt('oldest', 'Ældste først', _state.sort)
      +   opt('seen', 'Senest aktiv', _state.sort) + opt('name', 'Navn A-Å', _state.sort)
      + '</select>'
      + '</div>'
      + '<p class="admin-users-count" id="admin-users-count"></p>';
  }

  function filtered() {
    const q = _state.q.trim().toLowerCase();
    return _rows.filter((p) => {
      if (_state.kind === 'dealer' && p.seller_type !== 'dealer') return false;
      if (_state.kind === 'private' && p.seller_type === 'dealer') return false;
      if (_state.kind === 'suspended' && !isSuspended(p)) return false;
      if (!q) return true;
      return [p.name, p.shop_name, p.email, p.city, p.id]
        .some((v) => v && String(v).toLowerCase().includes(q));
    }).sort(SORTS[_state.sort] || SORTS.newest);
  }

  function renderRows() {
    const list = filtered();
    const host = document.getElementById('admin-users-rows');
    if (!host) return;
    document.getElementById('admin-users-count').textContent =
      list.length === _rows.length ? _rows.length + ' brugere' : list.length + ' af ' + _rows.length + ' brugere';
    if (!list.length) {
      host.innerHTML = '<p style="color:var(--muted)">Ingen brugere matcher.</p>';
      return;
    }
    host.innerHTML = list.map((p) =>
      '<div class="admin-user-item" data-user-id="' + esc(p.id) + '">'
      + _rowHtml(p)
      + '<div class="admin-user-detail" hidden></div>'
      + '</div>'
    ).join('');
    if (_openId) {
      const still = host.querySelector('[data-user-id="' + CSS.escape(_openId) + '"]');
      if (still) openDetail(still); else _openId = null;
    }
  }

  function onRowsClick(e) {
    const toggle = e.target.closest('.admin-user-toggle');
    if (!toggle) return;
    const item = toggle.closest('.admin-user-item');
    const detail = item.querySelector('.admin-user-detail');
    if (!detail.hidden) {
      detail.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      _openId = null;
      return;
    }
    const prev = document.querySelector('.admin-user-detail:not([hidden])');
    if (prev) {
      prev.hidden = true;
      prev.parentElement.querySelector('.admin-user-toggle')?.setAttribute('aria-expanded', 'false');
    }
    openDetail(item);
  }

  async function openDetail(item) {
    const id = item.dataset.userId;
    const p = _rows.find((r) => r.id === id);
    const detail = item.querySelector('.admin-user-detail');
    if (!p || !detail) return;
    _openId = id;
    item.querySelector('.admin-user-toggle')?.setAttribute('aria-expanded', 'true');
    detail.hidden = false;
    detail.innerHTML = profileHTML(p) + '<p style="color:var(--muted)">Henter annoncer og historik…</p>';

    const safe = (q) => q.then((r) => r, (err) => ({ data: null, error: err }));
    const [bikes, reviews, log] = await Promise.all([
      safe(supabase.from('bikes')
        .select('id, brand, model, price, is_active, created_at, deleted_at, sold_via')
        .eq('user_id', id).order('created_at', { ascending: false }).limit(50)),
      safe(supabase.from('reviews')
        .select('rating, comment, created_at')
        .eq('reviewed_user_id', id).order('created_at', { ascending: false }).limit(20)),
      safe(supabase.from('moderation_log')
        .select('created_at, action, admin_email, reason')
        .eq('target_user_id', id).order('created_at', { ascending: false }).limit(50)),
    ]);
    if (_openId !== id) return; // brugeren har åbnet en anden imens

    if (bikes.error && reviews.error && log.error) {
      detail.innerHTML = profileHTML(p) + retryHTML('Kunne ikke hente detaljer.', 'loadAllUsers');
      return;
    }
    detail.innerHTML = profileHTML(p)
      + bikesHTML(bikes)
      + reviewsHTML(reviews)
      + logHTML(log);
  }

  function profileHTML(p) {
    const yes = (v) => (v ? 'Ja' : 'Nej');
    const rows = [
      ['E-mail', esc(p.email || '–')],
      ['Type', p.seller_type === 'dealer' ? 'Forhandler' : 'Privat'],
      p.shop_name ? ['Butik', esc(p.shop_name)] : null,
      ['By', esc(p.city || '–')],
      p.address ? ['Adresse', esc(p.address)] : null,
      ['Oprettet', fmtDate(p.created_at)],
      ['Senest aktiv', p.last_seen ? esc(formatLastSeen(p.last_seen) || fmtDate(p.last_seen)) : '–'],
      ['E-mail bekræftet', yes(p.email_verified)],
      ['ID verificeret', yes(p.id_verified)],
      p.seller_type === 'dealer' ? ['Forhandler verificeret', yes(p.verified)] : null,
      isSuspended(p) ? ['Suspenderet til', fmtDate(p._susp_until) + (p._susp_reason ? ', ' + esc(p._susp_reason) : '')] : null,
      ['Bruger-id', '<code>' + esc(p.id) + '</code>'],
    ].filter(Boolean);
    return '<dl class="admin-user-facts">'
      + rows.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('')
      + '</dl>';
  }

  function section(title, inner) {
    return '<h4 class="admin-user-h">' + title + '</h4>' + inner;
  }

  function bikesHTML(res) {
    if (res.error) return section('Annoncer', '<p class="admin-user-empty">Kunne ikke hentes.</p>');
    const list = res.data || [];
    if (!list.length) return section('Annoncer', '<p class="admin-user-empty">Ingen annoncer.</p>');
    const status = (b) => b.deleted_at ? 'Slettet' : (b.is_active ? 'Aktiv' : (b.sold_via ? 'Solgt' : 'Inaktiv'));
    return section('Annoncer (' + list.length + (list.length === 50 ? '+' : '') + ')',
      '<ul class="admin-user-list">' + list.map((b) =>
        '<li><span>' + esc([b.brand, b.model].filter(Boolean).join(' ') || 'Uden titel') + '</span>'
        + '<span>' + (b.price != null ? Number(b.price).toLocaleString('da-DK') + ' kr.' : '') + '</span>'
        + '<span>' + status(b) + '</span>'
        + '<span>' + fmtDate(b.created_at) + '</span></li>'
      ).join('') + '</ul>');
  }

  function reviewsHTML(res) {
    if (res.error) return section('Vurderinger', '<p class="admin-user-empty">Kunne ikke hentes.</p>');
    const list = res.data || [];
    if (!list.length) return section('Vurderinger', '<p class="admin-user-empty">Ingen vurderinger.</p>');
    const avg = list.reduce((s, r) => s + (r.rating || 0), 0) / list.length;
    return section('Vurderinger (' + list.length + ', snit ' + avg.toFixed(1).replace('.', ',') + ')',
      '<ul class="admin-user-list">' + list.map((r) =>
        '<li><span>' + esc(String(r.rating)) + ' af 5</span>'
        + '<span class="admin-user-wide">' + esc(r.comment || '') + '</span>'
        + '<span>' + fmtDate(r.created_at) + '</span></li>'
      ).join('') + '</ul>');
  }

  function logHTML(res) {
    if (res.error) return section('Moderationshistorik', '<p class="admin-user-empty">Kunne ikke hentes.</p>');
    const list = res.data || [];
    if (!list.length) return section('Moderationshistorik', '<p class="admin-user-empty">Ingen moderationshandlinger.</p>');
    return section('Moderationshistorik',
      '<ul class="admin-user-list">' + list.map((l) =>
        '<li><span>' + esc(ACTION_LABELS[l.action] || l.action) + '</span>'
        + '<span class="admin-user-wide">' + esc(l.reason || '') + '</span>'
        + '<span>' + esc(l.admin_email || '') + '</span>'
        + '<span>' + fmtDate(l.created_at) + '</span></li>'
      ).join('') + '</ul>');
  }

  return { setUsers };
}
