/* ============================================================
   FORHANDLERE DER KØBER CYKLER (/opkoeb)
   En verificeret forhandler lægger et opkøbsønske op (fx "Vi køber
   brugte el-cykler"). En sælger tilbyder sin cykel ved at sende en
   almindelig besked om en af sine egne annoncer, så tråden lander i
   begges indbakke som alle andre tråde. Ingen ny beskedtype.

   Reglerne (kun verificerede forhandlere, højst 10 aktive) håndhæves i
   databasen: supabase/sql/add_buy_requests.sql.
   ============================================================ */

import { iconDealer, iconPin, iconMail, iconShield, iconStar, priceText, beskedFejl } from './utils.js';

const BIKE_TYPES = ['El-cykel', 'Racercykel', 'Mountainbike', 'Gravel', 'Citybike', 'Ladcykel', 'Børnecykel', 'Senior cykel'];
// Sælgeren uden annonce sendes til /sell og tilbage hertil med den nye cykel
// valgt. Nøglen læses af js/sell-page.js efter oprettelse.
const RETURN_KEY = 'buy_offer_return';

// link_url kommer fra add_buy_request_link.sql. Findes kolonnen ikke endnu,
// hentes listen uden den (se selectRequests), så siden ikke står tom hvis
// frontenden når ud før SQL'en er kørt.
const LINK_FIELD = 'link_url, ';
const SELECT_FIELDS = 'id, dealer_id, title, description, types, brands, min_year, max_price, is_active, created_at, ' +
  'dealer:profiles!buy_requests_dealer_id_fkey(id, shop_name, name, city)';

export function createBuyRequestsPage({
  supabase, esc, showToast, updateSEOMeta, showDetailView,
  navigateTo, getCurrentUser, getCurrentProfile, openLoginModal,
}) {
  let _requests = [];     // offentlige ønsker vist på siden
  let _own = [];          // forhandlerens egne, også skjulte
  let _editingId = null;
  let _formOpen = false;  // formularen til et nyt ønske er lukket, til forhandleren beder om den
  let _myBikes = null;    // sælgerens aktive annoncer, hentes ved første "Tilbyd"
  let _ratings = {};      // dealer_id -> { sum, n }, så sælgeren kan bedømme forhandleren

  let _hasLink = true;    // false hvis databasen endnu ikke har link_url

  // build(fields) laver forespørgslen. Svarer databasen "ukendt kolonne"
  // (42703), prøves igen uden link_url.
  async function selectRequests(build) {
    if (_hasLink) {
      const res = await build(LINK_FIELD + SELECT_FIELDS);
      if (res.error?.code !== '42703') return res;
      _hasLink = false;
    }
    return build(SELECT_FIELDS);
  }

  // Kun https, som CHECK-reglen i databasen. "upway.dk/opkoeb" får https:// på.
  function normalizeLink(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    try {
      const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
      if (u.protocol !== 'https:' || /[\s<>"']/.test(u.href) || u.href.length > 300) return undefined;
      return u.href;
    } catch { return undefined; }
  }

  function linkHTML(url) {
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
    return `<p class="br-card-link"><a href="${esc(url)}" target="_blank" rel="noopener nofollow ugc">Læs mere på ${esc(host)}</a></p>`;
  }

  const isVerifiedDealer = (p) => !!p && p.seller_type === 'dealer' && p.verified === true;
  const dealerName = (d) => d?.shop_name || d?.name || 'Forhandler';
  const kr = (n) => Number(n).toLocaleString('da-DK') + ' kr.';

  function criteriaFacts(r) {
    const facts = [];
    if (r.types?.length)  facts.push(r.types.map(esc).join(', '));
    if (r.brands?.length) facts.push(r.brands.map(esc).join(', '));
    if (r.min_year)       facts.push(`Fra årgang ${esc(r.min_year)}`);
    if (r.max_price)      facts.push(`Cykler op til ${kr(r.max_price)}`);
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
        </p>
        <p class="br-card-trust">
          <span>${iconShield(13)} Verificeret forhandler</span>
          <span>${ratingText(r.dealer_id)}</span>
        </p>` : ''}
        ${facts.length ? `<ul class="br-card-facts">${facts.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}
        ${r.description ? `<p class="br-card-desc">${esc(r.description).replace(/\n/g, '<br>')}</p>` : ''}
        ${r.link_url ? linkHTML(r.link_url) : ''}
        ${own ? '' : `<button type="button" class="br-offer-btn" id="br-offer-open-${esc(r.id)}" onclick="openBuyOffer('${esc(r.id)}')">Tilbyd din cykel</button>
        <div class="br-offer" id="br-offer-${esc(r.id)}" hidden></div>`}
      </article>`;
  }

  function ratingText(dealerId) {
    const x = _ratings[dealerId];
    if (!x?.n) return 'Ingen anmeldelser endnu';
    const avg = (x.sum / x.n).toLocaleString('da-DK', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `${iconStar(13)} ${avg} (${x.n} ${x.n === 1 ? 'anmeldelse' : 'anmeldelser'})`;
  }

  async function fetchRatings(dealerIds) {
    _ratings = {};
    if (!dealerIds.length) return;
    const { data } = await supabase.from('reviews').select('reviewed_user_id, rating')
      .in('reviewed_user_id', dealerIds);
    for (const rv of data || []) {
      const x = _ratings[rv.reviewed_user_id] ||= { sum: 0, n: 0 };
      x.sum += rv.rating; x.n += 1;
    }
  }

  async function fetchPublic(dealerId) {
    const { data, error } = await selectRequests(fields => {
      let q = supabase.from('buy_requests').select(fields)
        .eq('is_active', true).order('created_at', { ascending: false }).limit(100);
      return dealerId ? q.eq('dealer_id', dealerId) : q;
    });
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
        <div id="br-dealer-note"></div>
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
      await fetchRatings([...new Set(_requests.map(r => r.dealer_id))]);
    } catch (e) {
      if (list) list.innerHTML = `<p class="br-muted">Kunne ikke hente opkøbsønsker. <button type="button" class="br-link-btn" onclick="renderBuyRequestsPage()">Prøv igen</button></p>`;
      return;
    }
    if (!list) return;
    list.innerHTML = _requests.length
      ? _requests.map(r => requestCardHTML(r)).join('')
      : `<p class="br-muted">Ingen forhandlere søger cykler lige nu.</p>`;
    resumeOfferAfterSell();
  }

  /* Kommer sælgeren tilbage fra /sell (?tilbyd=<ønske>&cykel=<annonce>),
     sendes tilbuddet med det samme med den besked, sælgeren skrev før
     annoncen blev oprettet. Ét skridt: opret og tilbyd. */
  async function resumeOfferAfterSell() {
    const q = new URLSearchParams(location.search);
    const reqId = q.get('tilbyd'), bikeId = q.get('cykel');
    if (!reqId) return;
    history.replaceState(history.state, '', location.pathname);
    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null');
      sessionStorage.removeItem(RETURN_KEY);
    } catch {}
    if (!_requests.some(r => r.id === reqId)) return;
    _myBikes = null;
    await openBuyOffer(reqId);
    const sel = document.getElementById(`br-o-bike-${reqId}`);
    const msg = document.getElementById(`br-o-msg-${reqId}`);
    document.getElementById(`br-card-${reqId}`)?.scrollIntoView({ block: 'start' });
    if (!sel || !bikeId || ![...sel.options].some(o => o.value === bikeId)) return;
    sel.value = bikeId;
    if (msg && saved?.reqId === reqId && saved.msg) msg.value = saved.msg;
    await sendBuyOffer(reqId, { created: true });
  }

  function goSellForOffer(reqId) {
    const msg = document.getElementById(`br-o-msg-${reqId}`)?.value?.trim() || '';
    const dealer = dealerName(_requests.find(x => x.id === reqId)?.dealer);
    try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ reqId, msg, dealer, at: Date.now() })); } catch {}
    navigateTo('/sell');
  }

  const defaultMsg = (r) => `Hej. Jeg har en cykel, som måske passer til jeres opkøb "${r.title}". Hvad kan I give for den?`;

  /* ── Forhandlerens egne ønsker ─────────────────────────── */

  async function renderOwnSection() {
    const wrap = document.getElementById('br-own');
    if (!wrap) return;
    const user = getCurrentUser();
    const profile = getCurrentProfile();
    if (!user || profile?.seller_type !== 'dealer') {
      // Står under listen: siden er først og fremmest til sælgere.
      wrap.innerHTML = '';
      const note = document.getElementById('br-dealer-note');
      if (note) note.innerHTML = `<p class="br-dealer-note">Er du forhandler og vil købe cykler? <a href="/bliv-forhandler/" onclick="event.preventDefault();navigateTo('/bliv-forhandler')">Opret en forhandlerprofil</a>.</p>`;
      return;
    }
    if (!isVerifiedDealer(profile)) {
      wrap.innerHTML = `<p class="br-dealer-note">Du kan lægge opkøbsønsker op, når din forhandlerprofil er godkendt.</p>`;
      return;
    }
    const { data, error } = await selectRequests(fields => supabase.from('buy_requests').select(fields)
      .eq('dealer_id', user.id).order('created_at', { ascending: false }));
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
        ${editing || _formOpen
          ? formHTML(editing)
          : `<button type="button" class="br-offer-btn" onclick="openBuyRequestForm()">Nyt opkøbsønske</button>`}
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
          <div class="br-types-grid">${BIKE_TYPES.map(t => `<label class="br-chip"><input type="checkbox" name="br-f-type" value="${esc(t)}"${types.has(t) ? ' checked' : ''}> ${esc(t)}</label>`).join('')}</div>
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
        ${_hasLink ? `<label class="br-field">Link til jeres egen side <span class="br-muted">(valgfrit)</span>
          <input type="url" id="br-f-link" maxlength="300" inputmode="url" placeholder="https://jeresbutik.dk/opkoeb" value="${esc(v.link_url || '')}">
        </label>` : ''}
        <div class="br-form-actions">
          <button type="submit" class="br-offer-btn" id="br-f-save">${r ? 'Gem ændringer' : 'Læg op'}</button>
          <button type="button" class="br-link-btn" onclick="cancelBuyRequestEdit()">Annullér</button>
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
      ...(_hasLink ? { link_url: normalizeLink(document.getElementById('br-f-link')?.value) } : {}),
    };
  }

  async function saveBuyRequest() {
    const payload = readForm();
    if (payload.title.length < 3) { showToast('Skriv en overskrift', 'advarsel'); return; }
    if ('link_url' in payload && payload.link_url === undefined) { showToast('Linket skal være en https-adresse, fx https://jeresbutik.dk', 'advarsel'); return; }
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
    _formOpen = false;
    renderBuyRequestsPage();
  }

  function openBuyRequestForm() {
    _formOpen = true;
    renderOwnSection().then(() => document.getElementById('br-f-title')?.focus());
  }

  function editBuyRequest(id) {
    _editingId = id;
    renderOwnSection().then(() => document.getElementById('br-f-title')?.focus());
  }

  function cancelBuyRequestEdit() {
    _editingId = null;
    _formOpen = false;
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
    // Kun én orange knap ad gangen: "Tilbyd" skjules, mens panelet med "Send" er åbent.
    const openBtn = document.getElementById(`br-offer-open-${reqId}`);
    if (!box.hidden) { box.hidden = true; if (openBtn) openBtn.hidden = false; return; }
    const user = getCurrentUser();
    if (!user) { showToast('Log ind for at tilbyde din cykel', 'advarsel'); openLoginModal(); return; }
    const r = _requests.find(x => x.id === reqId);
    if (!r) return;

    box.hidden = false;
    if (openBtn) openBtn.hidden = true;
    const cancel = `<button type="button" class="br-link-btn" onclick="openBuyOffer('${esc(reqId)}')">Annullér</button>`;
    box.innerHTML = `<p class="br-muted">Henter dine annoncer…</p>`;
    if (!_myBikes) {
      const { data, error } = await supabase.from('bikes')
        .select('id, brand, model, type, year, price, is_giveaway')
        .eq('user_id', user.id).eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) { box.innerHTML = `<p class="br-muted">Kunne ikke hente dine annoncer.</p>${cancel}`; return; }
      _myBikes = data || [];
    }

    if (!_myBikes.length) {
      box.innerHTML = `
        <p>Forhandleren skal kunne se billeder og stand, så cyklen oprettes som annonce. Skriv din besked her. Den sendes til ${esc(dealerName(r.dealer))}, så snart annoncen er oprettet.</p>
        <label class="br-field">Besked
          <textarea id="br-o-msg-${esc(reqId)}" rows="3" maxlength="1000">${esc(defaultMsg(r))}</textarea>
        </label>
        <div class="br-form-actions">
          <a class="br-offer-btn" href="/sell/" onclick="event.preventDefault();goSellForOffer('${esc(reqId)}')">Opret annonce og send</a>
          ${cancel}
        </div>`;
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
        <textarea id="br-o-msg-${esc(reqId)}" rows="3" maxlength="1000">${esc(defaultMsg(r))}</textarea>
      </label>
      <div class="br-form-actions">
        <button type="button" class="br-offer-btn" id="br-o-send-${esc(reqId)}" onclick="sendBuyOffer('${esc(reqId)}')">${iconMail(15)} Send til ${esc(dealerName(r.dealer))}</button>
        ${cancel}
      </div>
      <p class="br-muted br-offer-new">Er cyklen ikke på listen? <a href="/sell/" onclick="event.preventDefault();goSellForOffer('${esc(reqId)}')">Opret en annonce</a>, så sendes den med beskeden ovenfor, når den er oprettet.</p>`;
  }

  async function sendBuyOffer(reqId, { created = false } = {}) {
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
    if (box) box.innerHTML = `<p>${created ? 'Annoncen er oprettet og sendt' : 'Sendt'}. Forhandleren får en e-mail, og svaret kommer i din <a href="/inbox/" onclick="event.preventDefault();navigateTo('/inbox')">indbakke</a>.</p>`;
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
    saveBuyRequest, openBuyRequestForm, editBuyRequest, cancelBuyRequestEdit, toggleBuyRequest, deleteBuyRequest,
    openBuyOffer, sendBuyOffer, goSellForOffer,
  };
}
