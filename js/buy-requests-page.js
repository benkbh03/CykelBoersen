/* ============================================================
   FORHANDLERE DER KØBER CYKLER (/opkoeb)
   En verificeret forhandler lægger et opkøbsønske op (fx "Vi køber
   brugte el-cykler"). En sælger tilbyder sin cykel ved at sende en
   almindelig besked om en af sine egne annoncer, så tråden lander i
   begges indbakke som alle andre tråde. Ingen ny beskedtype.

   Reglerne (kun verificerede forhandlere, højst 10 aktive) håndhæves i
   databasen: supabase/sql/add_buy_requests.sql.
   ============================================================ */

import { iconDealer, iconPin, iconMail, priceText, beskedFejl } from './utils.js';

const BIKE_TYPES = ['El-cykel', 'Racercykel', 'Mountainbike', 'Gravel', 'Citybike', 'Ladcykel', 'Børnecykel', 'Senior cykel'];
const SELECT_FIELDS = 'id, dealer_id, title, description, types, brands, min_year, max_price, is_active, created_at, ' +
  'dealer:profiles!buy_requests_dealer_id_fkey(id, shop_name, name, city)';

export function createBuyRequestsPage({
  supabase, esc, showToast, updateSEOMeta, showDetailView,
  navigateTo, getCurrentUser, getCurrentProfile, openLoginModal,
}) {
  let _requests = [];     // offentlige ønsker vist på siden
  let _own = [];          // forhandlerens egne, også skjulte
  let _editingId = null;
  let _myBikes = null;    // sælgerens aktive annoncer, hentes ved første "Tilbyd"

  const isVerifiedDealer = (p) => !!p && p.seller_type === 'dealer' && p.verified === true;
  const dealerName = (d) => d?.shop_name || d?.name || 'Forhandler';
  const kr = (n) => Number(n).toLocaleString('da-DK') + ' kr.';

  function criteriaFacts(r) {
    const facts = [];
    if (r.types?.length)  facts.push(r.types.map(esc).join(', '));
    if (r.brands?.length) facts.push(r.brands.map(esc).join(', '));
    if (r.min_year)       facts.push(`Fra årgang ${esc(r.min_year)}`);
    if (r.max_price)      facts.push(`Op til ${kr(r.max_price)}`);
    return facts;
  }

  function requestCardHTML(r, { showDealer = true } = {}) {
    const facts = criteriaFacts(r);
    const d = r.dealer;
    const own = getCurrentUser()?.id === r.dealer_id;
    return `
      <article class="br-card" id="br-card-${esc(r.id)}">
        <h2 class="br-card-title">${esc(r.title)}</h2>
        ${showDealer && d ? `<p class="br-card-dealer">
          <a href="/dealer/${esc(d.id)}/" onclick="event.preventDefault();navigateTo('/dealer/${esc(d.id)}')">${iconDealer(14)} ${esc(dealerName(d))}</a>
          ${d.city ? `<span>${iconPin(13)} ${esc(d.city)}</span>` : ''}
        </p>` : ''}
        ${facts.length ? `<ul class="br-card-facts">${facts.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}
        ${r.description ? `<p class="br-card-desc">${esc(r.description).replace(/\n/g, '<br>')}</p>` : ''}
        ${own ? '' : `<button type="button" class="br-offer-btn" onclick="openBuyOffer('${esc(r.id)}')">Tilbyd din cykel</button>
        <div class="br-offer" id="br-offer-${esc(r.id)}" hidden></div>`}
      </article>`;
  }

  async function fetchPublic(dealerId) {
    let q = supabase.from('buy_requests').select(SELECT_FIELDS)
      .eq('is_active', true).order('created_at', { ascending: false }).limit(100);
    if (dealerId) q = q.eq('dealer_id', dealerId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function renderBuyRequestsPage() {
    showDetailView();
    document.title = 'Forhandlere der køber brugte cykler | Cykelbørsen';
    updateSEOMeta('Cykelforhandlere der køber brugte cykler, fx el-cykler. Se hvad de leder efter, og tilbyd din cykel direkte.', '/opkoeb');
    const view = document.getElementById('detail-view');
    if (!view) return;

    view.innerHTML = `
      <div class="br-page">
        <button class="sell-back-btn" onclick="history.length > 1 ? history.back() : navigateTo('/')">← Tilbage</button>
        <header class="br-header">
          <h1 class="br-title">Forhandlere der køber cykler</h1>
          <p class="br-sub">Verificerede forhandlere, der leder efter bestemte cykler. Tilbyd din cykel ved at sende forhandleren en af dine annoncer.</p>
        </header>
        <div id="br-own"></div>
        <div id="br-list" class="br-list"><p class="br-muted">Henter opkøbsønsker…</p></div>
        <section class="br-how">
          <h2 class="br-how-title">Sådan sælger du til en forhandler</h2>
          <ol class="num-steps">
            <li>Opret en annonce for cyklen med billeder og stand, hvis du ikke allerede har en.</li>
            <li>Tryk "Tilbyd din cykel" ved det opkøbsønske der passer, og vælg annoncen.</li>
            <li>Forhandleren svarer i din indbakke. Prisen aftaler I selv.</li>
          </ol>
        </section>
      </div>`;

    renderOwnSection();

    const list = document.getElementById('br-list');
    try {
      _requests = await fetchPublic();
    } catch (e) {
      if (list) list.innerHTML = `<p class="br-muted">Kunne ikke hente opkøbsønsker. <button type="button" class="br-link-btn" onclick="renderBuyRequestsPage()">Prøv igen</button></p>`;
      return;
    }
    if (!list) return;
    list.innerHTML = _requests.length
      ? _requests.map(r => requestCardHTML(r)).join('')
      : `<p class="br-muted">Ingen forhandlere søger cykler lige nu.</p>`;
  }

  /* ── Forhandlerens egne ønsker ─────────────────────────── */

  async function renderOwnSection() {
    const wrap = document.getElementById('br-own');
    if (!wrap) return;
    const user = getCurrentUser();
    const profile = getCurrentProfile();
    if (!user || profile?.seller_type !== 'dealer') {
      wrap.innerHTML = `<p class="br-dealer-note">Er du forhandler og vil købe cykler? <a href="/bliv-forhandler/" onclick="event.preventDefault();navigateTo('/bliv-forhandler')">Opret en forhandlerprofil</a>.</p>`;
      return;
    }
    if (!isVerifiedDealer(profile)) {
      wrap.innerHTML = `<p class="br-dealer-note">Du kan lægge opkøbsønsker op, når din forhandlerprofil er godkendt.</p>`;
      return;
    }
    const { data, error } = await supabase.from('buy_requests').select(SELECT_FIELDS)
      .eq('dealer_id', user.id).order('created_at', { ascending: false });
    if (error) { wrap.innerHTML = `<p class="br-muted">Kunne ikke hente dine opkøbsønsker.</p>`; return; }
    _own = data || [];
    const editing = _own.find(r => r.id === _editingId) || null;

    wrap.innerHTML = `
      <section class="br-own">
        <h2 class="br-own-title">Dine opkøbsønsker</h2>
        ${_own.length ? `<ul class="br-own-list">${_own.map(r => `
          <li class="br-own-row${r.is_active ? '' : ' is-hidden'}">
            <span class="br-own-name">${esc(r.title)}${r.is_active ? '' : ' <span class="br-muted">(skjult)</span>'}</span>
            <span class="br-own-actions">
              <button type="button" class="br-link-btn" onclick="editBuyRequest('${esc(r.id)}')">Ret</button>
              <button type="button" class="br-link-btn" onclick="toggleBuyRequest('${esc(r.id)}', ${!r.is_active})">${r.is_active ? 'Skjul' : 'Vis igen'}</button>
              <button type="button" class="br-link-btn" onclick="deleteBuyRequest('${esc(r.id)}')">Slet</button>
            </span>
          </li>`).join('')}</ul>` : ''}
        ${formHTML(editing)}
      </section>`;
  }

  function formHTML(r) {
    const v = r || {};
    const types = new Set(v.types || []);
    return `
      <form class="br-form" onsubmit="event.preventDefault();saveBuyRequest()">
        <h3 class="br-form-title">${r ? 'Ret opkøbsønske' : 'Nyt opkøbsønske'}</h3>
        <label class="br-field">Overskrift
          <input type="text" id="br-f-title" maxlength="80" required placeholder="Vi køber brugte el-cykler" value="${esc(v.title || '')}">
        </label>
        <fieldset class="br-field br-types">
          <legend>Cykeltyper <span class="br-muted">(tom = alle)</span></legend>
          ${BIKE_TYPES.map(t => `<label class="br-chip"><input type="checkbox" name="br-f-type" value="${esc(t)}"${types.has(t) ? ' checked' : ''}> ${esc(t)}</label>`).join('')}
        </fieldset>
        <label class="br-field">Mærker <span class="br-muted">(adskil med komma, tom = alle)</span>
          <input type="text" id="br-f-brands" maxlength="400" placeholder="Riese & Müller, Kalkhoff, Gazelle" value="${esc((v.brands || []).join(', '))}">
        </label>
        <div class="br-form-row">
          <label class="br-field">Ældste årgang
            <input type="number" id="br-f-year" min="1990" max="2100" inputmode="numeric" placeholder="2019" value="${esc(v.min_year || '')}">
          </label>
          <label class="br-field">Højeste pris (kr.)
            <input type="number" id="br-f-price" min="1" max="1000000" inputmode="numeric" placeholder="25000" value="${esc(v.max_price || '')}">
          </label>
        </div>
        <label class="br-field">Beskrivelse
          <textarea id="br-f-desc" maxlength="1000" rows="4" placeholder="Hvad leder I efter, og hvordan foregår handlen (afhentning, betaling, stand)?">${esc(v.description || '')}</textarea>
        </label>
        <div class="br-form-actions">
          <button type="submit" class="br-offer-btn" id="br-f-save">${r ? 'Gem ændringer' : 'Læg op'}</button>
          ${r ? `<button type="button" class="br-link-btn" onclick="cancelBuyRequestEdit()">Annullér</button>` : ''}
        </div>
      </form>`;
  }

  function readForm() {
    const num = (id) => {
      const s = document.getElementById(id)?.value?.trim();
      return s ? parseInt(s, 10) : null;
    };
    const brands = (document.getElementById('br-f-brands')?.value || '')
      .split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);
    return {
      title:       (document.getElementById('br-f-title')?.value || '').trim(),
      description: (document.getElementById('br-f-desc')?.value || '').trim() || null,
      types:       [...document.querySelectorAll('input[name="br-f-type"]:checked')].map(i => i.value),
      brands:      [...new Set(brands)],
      min_year:    num('br-f-year'),
      max_price:   num('br-f-price'),
    };
  }

  async function saveBuyRequest() {
    const payload = readForm();
    if (payload.title.length < 3) { showToast('Skriv en overskrift', 'advarsel'); return; }
    const btn = document.getElementById('br-f-save');
    if (btn) btn.disabled = true;
    const q = _editingId
      ? supabase.from('buy_requests').update(payload).eq('id', _editingId)
      : supabase.from('buy_requests').insert(payload);
    const { error } = await q;
    if (btn) btn.disabled = false;
    if (error) {
      const msg = String(error.message || '');
      showToast(msg.includes('højst 10') ? 'Du kan højst have 10 aktive opkøbsønsker.' : 'Kunne ikke gemme opkøbsønsket', 'fejl');
      return;
    }
    showToast(_editingId ? 'Ændringerne er gemt' : 'Opkøbsønsket er lagt op', 'ok');
    _editingId = null;
    renderBuyRequestsPage();
  }

  function editBuyRequest(id) {
    _editingId = id;
    renderOwnSection().then(() => document.getElementById('br-f-title')?.focus());
  }

  function cancelBuyRequestEdit() {
    _editingId = null;
    renderOwnSection();
  }

  async function toggleBuyRequest(id, active) {
    const { error } = await supabase.from('buy_requests').update({ is_active: !!active }).eq('id', id);
    if (error) {
      showToast(String(error.message || '').includes('højst 10') ? 'Du kan højst have 10 aktive opkøbsønsker.' : 'Kunne ikke ændre opkøbsønsket', 'fejl');
      return;
    }
    renderBuyRequestsPage();
  }

  async function deleteBuyRequest(id) {
    if (!confirm('Slet opkøbsønsket? Beskeder du har fået, bliver i indbakken.')) return;
    const { error } = await supabase.from('buy_requests').delete().eq('id', id);
    if (error) { showToast('Kunne ikke slette opkøbsønsket', 'fejl'); return; }
    if (_editingId === id) _editingId = null;
    renderBuyRequestsPage();
  }

  /* ── Sælgeren tilbyder en cykel ───────────────────────── */

  function matches(r, b) {
    if (r.types?.length && !r.types.includes(b.type)) return false;
    if (r.brands?.length && !r.brands.some(br => (b.brand || '').toLowerCase().startsWith(br.toLowerCase()))) return false;
    if (r.min_year && b.year && b.year < r.min_year) return false;
    return true;
  }

  async function openBuyOffer(reqId) {
    const box = document.getElementById(`br-offer-${reqId}`);
    if (!box) return;
    if (!box.hidden) { box.hidden = true; return; }
    const user = getCurrentUser();
    if (!user) { showToast('Log ind for at tilbyde din cykel', 'advarsel'); openLoginModal(); return; }
    const r = _requests.find(x => x.id === reqId);
    if (!r) return;

    box.hidden = false;
    box.innerHTML = `<p class="br-muted">Henter dine annoncer…</p>`;
    if (!_myBikes) {
      const { data, error } = await supabase.from('bikes')
        .select('id, brand, model, type, year, price, is_giveaway')
        .eq('user_id', user.id).eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) { box.innerHTML = `<p class="br-muted">Kunne ikke hente dine annoncer.</p>`; return; }
      _myBikes = data || [];
    }

    if (!_myBikes.length) {
      box.innerHTML = `
        <p>Forhandleren skal kunne se cyklen. Opret en annonce først med billeder og stand, og kom så tilbage hertil.</p>
        <a class="br-offer-btn" href="/sell/" onclick="event.preventDefault();navigateTo('/sell')">Opret annonce</a>`;
      return;
    }

    const sorted = [..._myBikes].sort((a, b) => matches(r, b) - matches(r, a));
    box.innerHTML = `
      <label class="br-field">Hvilken cykel?
        <select id="br-o-bike-${esc(reqId)}">
          ${sorted.map(b => `<option value="${esc(b.id)}">${esc(b.brand)} ${esc(b.model)}${b.year ? ` (${esc(b.year)})` : ''}, ${esc(priceText(b))}${matches(r, b) ? '' : ' (passer ikke helt)'}</option>`).join('')}
        </select>
      </label>
      <label class="br-field">Besked
        <textarea id="br-o-msg-${esc(reqId)}" rows="3" maxlength="1000">Hej. Jeg har en cykel, som måske passer til jeres opkøb "${esc(r.title)}". Hvad kan I give for den?</textarea>
      </label>
      <button type="button" class="br-offer-btn" id="br-o-send-${esc(reqId)}" onclick="sendBuyOffer('${esc(reqId)}')">${iconMail(15)} Send til ${esc(dealerName(r.dealer))}</button>`;
  }

  async function sendBuyOffer(reqId) {
    const user = getCurrentUser();
    const r = _requests.find(x => x.id === reqId);
    if (!user || !r) return;
    const bikeId  = document.getElementById(`br-o-bike-${reqId}`)?.value;
    const content = document.getElementById(`br-o-msg-${reqId}`)?.value?.trim();
    if (!bikeId)  { showToast('Vælg en annonce', 'advarsel'); return; }
    if (!content) { showToast('Skriv en besked', 'advarsel'); return; }

    const btn = document.getElementById(`br-o-send-${reqId}`);
    if (btn) btn.disabled = true;
    const { data, error } = await supabase.from('messages').insert({
      bike_id: bikeId, sender_id: user.id, receiver_id: r.dealer_id, content,
    }).select('id').single();
    if (btn) btn.disabled = false;
    if (error) { const f = beskedFejl(error, 'Kunne ikke sende besked'); showToast(f.tekst, f.type); return; }

    if (data?.id) {
      supabase.functions.invoke('notify-message', { body: { message_id: data.id } }).catch(() => {});
    }
    const box = document.getElementById(`br-offer-${reqId}`);
    if (box) box.innerHTML = `<p>Sendt. Forhandleren får en e-mail, og svaret kommer i din <a href="/inbox/" onclick="event.preventDefault();navigateTo('/inbox')">indbakke</a>.</p>`;
  }

  /* ── Afsnit på forhandlerens profilside ───────────────── */

  async function renderDealerBuyRequests(dealerId, elId = 'dp-buy-requests') {
    const el = document.getElementById(elId);
    if (!el) return;
    let rows;
    try { rows = await fetchPublic(dealerId); } catch { return; }
    if (!rows.length || !document.getElementById(elId)) return;
    _requests = rows;
    el.innerHTML = `
      <section class="br-profile">
        <h2 class="br-own-title">Køber lige nu</h2>
        ${rows.map(r => requestCardHTML(r, { showDealer: false })).join('')}
      </section>`;
  }

  return {
    renderBuyRequestsPage, renderDealerBuyRequests,
    saveBuyRequest, editBuyRequest, cancelBuyRequestEdit, toggleBuyRequest, deleteBuyRequest,
    openBuyOffer, sendBuyOffer,
  };
}
