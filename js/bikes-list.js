import { bikeTitle, bikeMetaFacts, iconDealer, iconPrivate, iconShield, priceLabel, iconHeart, iconPin, iconBike } from './utils.js';
import { iconSearch, noImagePlaceholder } from './ui-icons.js';
import { cardSellerLine } from './card-seller.js';
import { CITY_GROUPS, applyFilterArgs } from './bike-filter-query.js';
import { findNearMatch, nearMatchHeadHTML } from './near-matches.js';


export function createBikesList({
  supabase,
  BIKES_PAGE_SIZE,
  BIKES_LOAD_MORE_SIZE,
  esc,
  safeAvatarUrl,
  getInitials,
  formatLastSeen,
  retryHTML,
  transformImageUrl,
  // Collaborator functions
  updateActiveFiltersBar,
  updateCykelagentCta,
  applyNearMeFilter,
  hasActiveFilters,
  describeActiveFilters,
  // State accessors
  getBikesOffset,
  setBikesOffset,
  getFilterOffset,
  setFilterOffset,
  getCurrentFilters,
  setCurrentFilters,
  setCurrentFilterArgs,
  getCurrentUser,
  getUserGeoCoords,
  getActiveRadius,
  userSavedSet,        // Set reference (mutated)
  askedAvailableSet,   // Set reference (read)
  getBrowseCategory,   // () => aktiv browse-kategori ('cykel' | 'tilbehoer')
}) {
  // Læs ?vist=N fra URL'en — kun gyldigt på initial load, og kun til at hente
  // en større førstesats så delelig/bookmarkbar position kan genskabes.
  function readVistFromUrl() {
    try {
      const n = parseInt(new URL(window.location).searchParams.get('vist'), 10);
      if (n && n > BIKES_PAGE_SIZE && n <= 200) return n;
    } catch (e) {}
    return null;
  }

  // Opdater ?vist=N i URL'en uden at tilføje history-entry (so back-knap virker).
  function writeVistToUrl(offset) {
    try {
      const url = new URL(window.location);
      if (offset > BIKES_PAGE_SIZE) url.searchParams.set('vist', String(offset));
      else url.searchParams.delete('vist');
      window.history.replaceState({}, '', url);
    } catch (e) {}
  }

  // Log fritekst-søgninger (anonymt) til search_logs, så admin kan se hvad folk
  // leder efter — især nul-resultat-søgninger = umødt efterspørgsel. Dedupéres så
  // samme søgning ikke logges flere gange i træk (fx ved re-render).
  let _lastLoggedSearch = '';
  // Ids på aktive fremhævede (boostede) annoncer fra seneste initial load.
  // Ekskluderes fra hoved-listen så de ikke optræder dobbelt på tværs af pagination.
  let _featuredIds = [];
  function logSearch(term, type, city, count) {
    const q = (term || '').trim();
    if (!q) return;
    const key = q.toLowerCase() + '|' + (type || '') + '|' + (city || '');
    if (key === _lastLoggedSearch) return;
    _lastLoggedSearch = key;
    supabase.from('search_logs').insert({
      query: q.slice(0, 100),
      type: type || null,
      city: city || null,
      result_count: count,
    }).then(() => {}, () => {}); // fire-and-forget
  }

  async function loadBikes(filters = {}, append = false) {
    const grid = document.getElementById('listings-grid');

    // Loading-state på "Vis flere"-knappen — viser spinner + "Henter…" tekst og
    // disabler knappen så brugeren ikke kan klikke igen mens netværkskaldet kører
    let appendBtn = null;
    if (append) {
      appendBtn = document.querySelector('#load-more-btn button');
      if (appendBtn) {
        appendBtn.disabled = true;
        appendBtn.dataset.origText = appendBtn.innerHTML;
        appendBtn.innerHTML = '<span class="btn-spinner"></span>Henter…';
      }
    }

    if (!append) {
      setBikesOffset(0);
      setCurrentFilters(filters);
      grid.innerHTML = Array(6).fill(`
        <div class="bike-card skeleton-card">
          <div class="skeleton-img"></div>
          <div class="skeleton-body">
            <div class="skeleton-line skeleton-line--title"></div>
            <div class="skeleton-line skeleton-line--sub"></div>
            <div class="skeleton-line skeleton-line--price"></div>
          </div>
        </div>`).join('');
      const old = document.getElementById('load-more-btn');
      if (old) old.remove();
    }

    const offset = getBikesOffset();
    // Asymmetrisk pagination:
    //   - Initial load: BIKES_PAGE_SIZE (kompakt landing, fx 12)
    //   - Initial load med ?vist=N i URL: brug N for at genskabe brugerens position
    //   - "Vis flere"-klik (append=true): BIKES_LOAD_MORE_SIZE (større batches, fx 24)
    const initialVist = !append ? readVistFromUrl() : null;
    const fetchCount = append
      ? BIKES_LOAD_MORE_SIZE
      : (initialVist || BIKES_PAGE_SIZE);

    // Sælgertype-filter kræver INNER join: med almindeligt (left) join fjerner
    // .eq('profiles.seller_type', …) IKKE rækkerne — PostgREST nuller bare det
    // embeddede profiles-objekt, så alle cykler stadig vises (med "Ukendt"
    // sælger). !inner gør filteret til et rigtigt WHERE på forælder-rækkerne,
    // og .range()-pagineringen tæller så også korrekt server-side.
    const profilesJoin = filters.sellerType ? 'profiles!user_id!inner' : 'profiles!user_id';
    const SELECT_FIELDS = `id, category, brand, model, price, is_giveaway, original_price, type, city, condition, year, size, size_cm, color, colors, warranty, external_url, is_active, created_at, user_id, featured_until, frame_material, brake_type, groupset, electronic_shifting, weight_kg, motor, motor_position, battery_wh, suspension, geartype, step_type, frame_last4, ${profilesJoin}(name, seller_type, shop_name, verified, id_verified, email_verified, avatar_url, avatar_thumb_url, address, last_seen), bike_images(url, thumb_url, is_primary)`;

    // Fælles filtre — anvendes på BÅDE hoved-listen og fremhævede-query, så et
    // boost kun løftes op når annoncen rent faktisk matcher det aktuelle filter.
    const applyListFilters = (q) => {
      // Hård top-level separation: browse viser én kategori ad gangen (default cykel).
      q = q.eq('category', filters.category || (getBrowseCategory ? getBrowseCategory() : 'cykel'));
      if (filters.sellerType) q = q.eq('profiles.seller_type', filters.sellerType);
      if (filters.type) q = q.eq('type', filters.type);
      if (filters.city) {
        const group = CITY_GROUPS[filters.city];
        if (group) q = q.or(group.map(c => `city.ilike.%${c}%`).join(','));
        else       q = q.ilike('city', `%${filters.city}%`);
      }
      if (filters.maxPrice) q = q.lte('price', filters.maxPrice);
      if (filters.search) {
        const s = filters.search.replace(/[%_\\,.()"']/g, '');
        if (s) q = q.or(`brand.ilike.%${s}%,model.ilike.%${s}%`);
      }
      if (filters.warranty) q = q.not('warranty', 'is', null);
      if (filters.newOnly)  q = q.gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      return q;
    };

    // FREMHÆVEDE (boostede) annoncer der stadig er aktive løftes øverst — kun på
    // initial load (ikke ved "Vis flere"). featured_until > NOW() sikrer at udløbne
    // boosts IKKE forurener rækkefølgen. Nyeste boost først.
    //
    // Fremhævede og normale hentes SAMTIDIG. Før ventede hoved-listen på de
    // fremhævede (for at kunne ekskludere dem i forespørgslen), og kortene på
    // gemte hjerter: tre rundture i træk før første kort. Nu henter hoved-
    // listen en hel side og fjerner de fremhævede bagefter. Resultatet er det
    // samme: de første k ikke-fremhævede efter created_at, altså præcis det
    // interval .not('id','in',…).range(0, k-1) ville have givet, så "Vis
    // flere" fortsætter fra det rigtige sted.
    const mainQuery = (count, excludeIds) => {
      let q = applyListFilters(
        supabase
          .from('bikes')
          .select(SELECT_FIELDS)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .range(offset, offset + count - 1)
      );
      // Ekskludér fremhævede fra hoved-listen så de ikke vises dobbelt (de er
      // allerede prepended øverst). _featuredIds persisterer over pagination.
      if (excludeIds.length) q = q.not('id', 'in', `(${excludeIds.join(',')})`);
      return q;
    };

    let featuredData = [];
    let rawData, error, mainFetchCount;
    if (!append) {
      const [featuredRes, mainRes] = await Promise.all([
        applyListFilters(
          supabase
            .from('bikes')
            .select(SELECT_FIELDS)
            .eq('is_active', true)
            .gt('featured_until', new Date().toISOString())
            .order('featured_until', { ascending: false })
            .limit(24)
        ),
        mainQuery(fetchCount, []),
      ]);
      // Sælgertype håndteres DB-side via !inner-join i applyListFilters.
      featuredData = featuredRes.data || [];
      _featuredIds = featuredData.map(b => b.id);
      // Træk de prependede fremhævede fra den normale batch, så total-antallet
      // (fremhævet + normal) rammer en hel side og fylder alle grid-rækker ud.
      mainFetchCount = Math.max(fetchCount - featuredData.length, 0);
      const featuredSet = new Set(_featuredIds);
      error   = mainRes.error;
      rawData = (mainRes.data || []).filter(b => !featuredSet.has(b.id)).slice(0, mainFetchCount);
    } else {
      mainFetchCount = fetchCount;
      ({ data: rawData, error } = await mainQuery(fetchCount, _featuredIds));
    }

    if (error) {
      console.error('loadBikes fejl:', error);
      if (!append) grid.innerHTML = '<p style="color:var(--rust);padding:20px">Kunne ikke hente annoncer.</p>';
      return;
    }

    // Sælgertype er allerede filtreret DB-side (!inner-join) — ingen klient-
    // filtrering her: den fik offset/pagination til at tælle forkert (offset
    // steg med det filtrerede antal, mens .range() var rykket det rå antal).
    const normalData = rawData || [];

    // Render-rækkefølge: fremhævede øverst (kun initial load), derefter normale.
    const data = append ? normalData : [...featuredData, ...normalData];

    if (!append && filters.search) logSearch(filters.search, filters.type, filters.city, data.length);

    renderBikes(data, append);
    // Hjerterne markeres EFTER kortene står der, ikke før: forespørgslen
    // afhænger af annonce-id'erne og kostede ellers en hel rundtur ekstra.
    markSavedHearts(data.map(b => b.id));
    updateActiveFiltersBar();
    updateCykelagentCta();

    // Offset/pagination tæller KUN normale rækker — fremhævede er prepended
    // separat og ekskluderet fra hoved-query'en, så de må ikke tælle med.
    setBikesOffset(getBikesOffset() + normalData.length);
    writeVistToUrl(getBikesOffset());

    const existing = document.getElementById('load-more-btn');
    if (existing) existing.remove();

    const footer = document.createElement('div');
    footer.id = 'load-more-btn';
    // Fuld batch → der kan være flere → vis "Vis flere"-knap
    if (normalData.length === mainFetchCount && mainFetchCount > 0) {
      footer.innerHTML = `<button onclick="loadMoreBikes()" style="display:block;margin:24px auto;padding:12px 32px;background:var(--forest);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">Vis flere cykler</button>`;
    } else if (append && getBikesOffset() > BIKES_PAGE_SIZE) {
      footer.innerHTML = `<p style="text-align:center;color:var(--muted);padding:16px 0 24px;font-size:0.9rem;">Ingen flere cykler at vise</p>`;
    } else {
      return;
    }
    const dealerBanner = document.querySelector('.dealer-banner-mobile');
    const anchor = dealerBanner || document.getElementById('listings-map') || grid;
    anchor.after(footer);
  }

  function renderListingsEmptyState() {
    const _isAcc = (getBrowseCategory ? getBrowseCategory() : 'cykel') === 'tilbehoer';
    if (!hasActiveFilters()) {
      return `
        <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
          <div style="margin-bottom:16px;color:var(--muted);">${iconBike(56)}</div>
          <h3 style="font-family:var(--font-sans);font-weight:var(--weight-heavy);letter-spacing:-0.02em;font-size:1.4rem;margin-bottom:10px;color:var(--charcoal);">${_isAcc ? 'Ingen tilbehør her endnu' : 'Ingen cykler her endnu'}</h3>
          <p style="color:var(--muted);font-size:0.9rem;max-width:340px;margin:0 auto 24px;line-height:1.6;">Vær den første til at sælge ${_isAcc ? 'dit cykeltilbehør' : 'din cykel'} på Cykelbørsen. Det er gratis og tager kun 2 minutter.</p>
          <button onclick="openModal()" style="background:var(--rust);color:#fff;border:none;padding:13px 28px;border-radius:8px;font-size:0.92rem;font-weight:600;cursor:pointer;font-family:var(--font-sans);">${_isAcc ? '+ Sæt tilbehør til salg' : '+ Sæt din cykel til salg'}</button>
        </div>`;
    }

    const filterDesc = describeActiveFilters();
    const filterText = filterDesc.length > 0
      ? `<p class="empty-filters-desc">Filtre: <strong>${esc(filterDesc.join(' · '))}</strong></p>`
      : '';

    /* Tom liste med filtre: to veje videre. Fjern det filter der sidst
       blev sat (det er som regel det der tømte listen), eller lad en
       Cykelagent holde øje, så man får besked når en cykel dukker op.
       "Fjern sidste filter" falder tilbage til at rydde alt, hvis
       rækkefølgen ikke er kendt. */
    return `
      <div class="empty-filters">
        <h3 class="empty-filters-title">${_isAcc ? 'Intet tilbehør matcher lige nu' : 'Ingen cykler matcher lige nu'}</h3>
        ${filterText}
        <div class="empty-filters-actions">
          <button type="button" class="empty-filters-btn empty-filters-btn--primary" onclick="(window.removeLastFilter || window.clearAllFilters)()">Fjern sidste filter</button>
          <button type="button" class="empty-filters-btn" onclick="saveCurrentSearch()">Opret Cykelagent med disse filtre</button>
        </div>
      </div>`;
  }

  /* Markér de viste kort, brugeren selv har gemt. Kører efter render, så
     kortene ikke venter på den. RLS giver kun egne gemte rækker (og gemte på
     egne annoncer, derfor filteret på user_id), så en anonym besøgende
     springer kaldet helt over. getSession() læser den lokale session og
     rammer ikke netværket. */
  async function markSavedHearts(bikeIds) {
    if (!bikeIds.length) return;
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    const { data } = await supabase
      .from('saved_bikes')
      .select('bike_id')
      .eq('user_id', uid)
      .in('bike_id', bikeIds);
    (data || []).forEach(({ bike_id }) => {
      userSavedSet.add(bike_id);
      document.querySelectorAll(`.save-btn[data-bike-id="${bike_id}"]`).forEach(btn => {
        btn.classList.add('is-saved');
        btn.setAttribute('aria-pressed', 'true');
      });
    });
  }

  /* Kortenes HTML. Delt mellem listen og "nærmeste match" i tom-tilstanden. */
  function bikeCardsHTML(bikes) {
    const conditionClass = c => {
      if (c === 'Ny')        return 'condition-tag--ny';
      if (c === 'Som ny')    return 'condition-tag--som-ny';
      if (c === 'God stand') return 'condition-tag--god';
      return 'condition-tag--brugt';
    };

    const currentUser = getCurrentUser();

    return bikes.map((b, i) => {
      const profile    = b.profiles || {};
      const sellerType = profile.seller_type || 'private';
      const sellerName = sellerType === 'dealer' ? profile.shop_name : profile.name;
      const isDemo     = profile.shop_name === 'Cykelbørsen Demo';
      const initials   = getInitials(sellerName);
      // Sortér med primary først; max 4 billeder i hover-cyklen (egress-hensyn).
      // Brug thumb_url (~800px) når den findes — fald tilbage til fuld url.
      const allImgs    = (b.bike_images || []).slice().sort((a, x) => (x.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
      const imgUrls    = allImgs.slice(0, 4).map(i => i.thumb_url || i.url);
      const primaryImg = imgUrls[0];
      const thumbSrc   = primaryImg || '';
      const hasMulti   = imgUrls.length >= 2;
      const dataImgs   = hasMulti ? ` data-imgs='${JSON.stringify(imgUrls)}'` : '';
      const imgContent = primaryImg
        ? `<img src="${thumbSrc}" alt="${esc(b.brand)} ${esc(b.model)}" loading="lazy" decoding="async" width="400" height="300" class="bcimg bcimg--front">${hasMulti ? '<img alt="" class="bcimg bcimg--back" loading="lazy" decoding="async">' : ''}`
        : noImagePlaceholder();
      // Foretræk avatar_thumb_url (~128px WebP, ~10 KB) over fuld upload (~300 KB).
      // transformImageUrl er no-op uden Pro-plan og returnerede fuld URL — det
      // var den primære kilde til unødig forside-egress.
      const avatarFull  = safeAvatarUrl(profile.avatar_url);
      const avatarThumb = safeAvatarUrl(profile.avatar_thumb_url) || avatarFull;
      const avatarHtml = avatarThumb
        ? `<img src="${avatarThumb}" alt="" loading="lazy" decoding="async" width="40" height="40">`
        : esc(initials);

      var isSold = !b.is_active;
      var isFeatured = !isSold && b.featured_until && new Date(b.featured_until).getTime() > Date.now();
      var isSaved = userSavedSet.has(b.id);
      var cityAttr     = b.city ? ` data-city="${esc(b.city)}"` : '';
      var addrAttr     = (sellerType === 'dealer' && profile.address) ? ` data-address="${esc(profile.address)}"` : '';
      var sellerAttr   = ` data-seller-type="${sellerType || 'private'}"`;
      // Besparelse (før-pris minus pris) → rabatbadge + "Største besparelse"-sort.
      // KUN forhandlere: deres før-pris er en ægte vejl. udsalgspris (og de er
      // lovmæssigt bundet af Markedsføringsloven). Private kunne ellers liste højt
      // og straks sætte ned for at fake et "godt tilbud" — derfor ingen rabat der.
      var saving       = (sellerType === 'dealer' && b.original_price && b.original_price > b.price) ? (b.original_price - b.price) : 0;
      var savingAttr   = ` data-saving="${saving}"`;
      // "Sidst aktiv" vises kun for PRIVATE sælgere (login-tid er misvisende for
      // en butik der auto-synces nat for nat). For forhandlere skjules den — men
      // linjen reserveres tom nedenfor (&nbsp;), så kort-footeren og divider-
      // linjen flugter ens og ikke ser ujævnt ud.
      const lastSeenCard = sellerType === 'dealer' ? null : formatLastSeen(profile.last_seen, 72);
      return `
        <div class="bike-card${isFeatured ? ' bike-card--featured' : ''}"${cityAttr}${addrAttr}${sellerAttr}${savingAttr} ${isSold ? ' style="opacity:0.7"' : ''} onclick="${isSold ? '' : "navigateToBike('" + b.id + "')"}">
          <div class="bike-card-img"${dataImgs}>
            ${imgContent}
            ${isSold ? '<div class="sold-tag"><span>SOLGT</span></div>' : ''}
            <div class="bike-card-badges">
              ${isFeatured ? '<span class="featured-card-badge">Betalt promovering</span>' : ''}
              ${isDemo ? '<span class="demo-badge">EKSEMPEL</span>' : ''}
              <span class="condition-tag ${conditionClass(b.condition)}">${esc(b.condition)}</span>
              ${b.warranty && !isSold && !isDemo ? `<span class="warranty-card-badge">${iconShield()}Garanti</span>` : ''}
            </div>
            ${!isSold && !isDemo ? `<button class="save-btn${isSaved ? ' is-saved' : ''}" data-bike-id="${b.id}" onclick="event.stopPropagation();toggleSave(this,'${b.id}')" aria-label="Gem annonce" aria-pressed="${isSaved}">${iconHeart(16)}</button>` : ''}
            ${!isSold && !isDemo ? `<label class="compare-checkbox-wrap" onclick="event.stopPropagation()" title="Vælg til sammenligning"><input type="checkbox" class="compare-checkbox" data-bike-id="${b.id}" onchange="toggleCompareBike(this,'${b.id}')"><span class="compare-checkbox-label">Sammenlign</span></label>` : ''}
          </div>
          <div class="bike-card-body">
            <div class="card-top">
              <div class="bike-title">${esc(bikeTitle(b.brand, b.model))}</div>
              <div class="bike-price">${priceLabel(b)}${!isSold && !isDemo && saving > 0
                ? ` <span class="bike-price-before" aria-label="Førpris ${b.original_price.toLocaleString('da-DK')} kroner">${b.original_price.toLocaleString('da-DK')} kr.</span>`
                : ''}</div>
            </div>
            ${(() => {
              const facts = [b.type, ...bikeMetaFacts(b)].filter(Boolean);
              return facts.length
                ? `<div class="bike-meta">${facts.map(f => `<span>${esc(f)}</span>`).join('')}</div>`
                : '';
            })()}
            <div class="card-footer">
              ${/* Én linje: type-ikon, navn, flueben, stelnummer-skjold, by.
                    Avatar-cirklen og "sidst aktiv"-linjen er fjernet fra kortet:
                    de gjorde kortet højere uden at hjælpe køberen med at vælge
                    mellem to cykler. Begge står stadig på annoncesiden.
                    frame_last4 skal med i BEGGE select-strenge ovenfor, ellers
                    forsvinder skjoldet så snart brugeren filtrerer. */''}
              ${cardSellerLine(profile, b.city, b.frame_last4 ? `<span class="card-frame-badge" title="Stelnummer oplyst af sælger" aria-label="Stelnummer oplyst af sælger">${iconShield(13)}</span>` : '')}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function renderBikes(bikes, append = false) {
    const grid = document.getElementById('listings-grid');
    if (!append) _nearSeq++;

    if (!append && (!bikes || bikes.length === 0)) {
      grid.innerHTML = renderListingsEmptyState();
      return;
    }

    if (!bikes || bikes.length === 0) return;

    const html = bikeCardsHTML(bikes);

    if (append) {
      grid.insertAdjacentHTML('beforeend', html);
    } else {
      grid.innerHTML = html;
    }

    if (getUserGeoCoords() && getActiveRadius()) applyNearMeFilter();
    // Synkronisér sammenlignings-checkboxes så tidligere valgte cykler vises som tjekket
    if (typeof window.syncCompareCheckboxes === 'function') window.syncCompareCheckboxes();
  }

  function searchBikes() {
    const search = document.getElementById('search-input').value;
    // Dropdown'en er fjernet fra søgebaren; typen vælges nu med chip-rækken
    // over annoncerne. Opslaget beholdes med ?. frem for at blive slettet:
    // type-sync.js sætter stadig feltet hvis det findes, og en fremtidig
    // flade kan genindføre det uden at denne linje skal røres.
    const type   = document.getElementById('search-type')?.value || '';
    const city   = document.getElementById('search-city').value;
    const radius = document.getElementById('search-city-radius')?.value;
    // Hvis brugeren har valgt en radius, springer vi DB'ens city-filter over.
    // Ellers ville cykler i nabokommuner (fx Frederiksberg, når man søger
    // Valby+100km) aldrig blive loaded, og distance-filteret ville køre på
    // 0 kandidater. Distancen håndteres så af applyNearMeFilter via DAWA-koordinater.
    loadBikes({ search, type, city: radius ? null : city });
  }

  /* Kolonnerne til kortene i den filtrerede liste. Også brugt af
     "nærmeste match", så kortene dér ser ens ud. */
  const filterSelect = join => `id, category, brand, model, price, is_giveaway, original_price, type, city, condition, year, size, size_cm, color, colors, warranty, external_url, is_active, created_at, user_id, featured_until, frame_material, brake_type, groupset, electronic_shifting, weight_kg, motor, motor_position, battery_wh, suspension, geartype, step_type, frame_last4, ${join}(name, seller_type, shop_name, verified, id_verified, email_verified, avatar_url, avatar_thumb_url, address, last_seen), bike_images(url, thumb_url, is_primary)`;

  // Gør et sent svar fra "nærmeste match" uskadeligt, hvis filtrene er skiftet.
  let _nearSeq = 0;

  async function showNearMatch(args) {
    const seq = ++_nearSeq;
    const category = args.category || (getBrowseCategory ? getBrowseCategory() : 'cykel');
    let match = null;
    try {
      match = await findNearMatch({ supabase, args, category, selectCols: filterSelect });
    } catch { return; }
    if (!match || seq !== _nearSeq) return;
    const grid = document.getElementById('listings-grid');
    const empty = grid?.querySelector('.empty-filters');
    if (!empty) return;

    /* Den primære knap fjernede før "sidste filter". Når vi ved hvilket
       filter der tømmer listen, fjerner den netop det. */
    const btn = empty.querySelector('.empty-filters-btn--primary');
    if (btn) {
      btn.textContent = `Fjern ${match.label}`;
      btn.onclick = () => (window.removeFilterGroup || window.clearAllFilters)(match.group);
    }
    empty.classList.add('empty-filters--with-near');
    empty.insertAdjacentHTML('afterend',
      nearMatchHeadHTML(match, { esc, isAccessory: category === 'tilbehoer' }) + bikeCardsHTML(match.bikes));
    markSavedHearts(match.bikes.map(b => b.id));
    if (typeof window.syncCompareCheckboxes === 'function') window.syncCompareCheckboxes();
  }

  async function loadBikesWithFilters({
    types = [], conditions = [], minPrice, maxPrice, sellerType, dealerId,
    wheelSizes = [], sizes = [], colors = [], brands = [],
    frameMaterials = [], brakeTypes = [], groupsets = [], electronicShifting = null,
    motors = [], motorPositions = [], batteryMin, batteryMax,
    suspensions = [], geartypes = [], stepTypes = [],
    maxWeight = null, city = null, search = null, giveaway = null,
    category = (getBrowseCategory ? getBrowseCategory() : 'cykel'),
  } = {}, append = false) {
    const grid = document.getElementById('listings-grid');

    // Loading-state på "Vis flere"-knappen (same som loadBikes)
    if (append) {
      const appendBtn = document.querySelector('#load-more-btn button');
      if (appendBtn) {
        appendBtn.disabled = true;
        appendBtn.innerHTML = '<span class="btn-spinner"></span>Henter…';
      }
    }

    if (!append) {
      setFilterOffset(0);
      setCurrentFilterArgs({
        types, conditions, minPrice, maxPrice, sellerType, dealerId,
        wheelSizes, sizes, colors, brands,
        frameMaterials, brakeTypes, groupsets, electronicShifting,
        motors, motorPositions, batteryMin, batteryMax,
        suspensions, geartypes, stepTypes,
        maxWeight, city, search, giveaway, category,
      });
      grid.innerHTML    = '<p style="color:var(--muted);padding:20px">Henter annoncer...</p>';
      const old = document.getElementById('load-more-btn');
      if (old) old.remove();
    }

    const offset = getFilterOffset();
    // Samme asymmetriske pagination som loadBikes: kompakt initial, større append
    const filterFetchCount = append ? BIKES_LOAD_MORE_SIZE : BIKES_PAGE_SIZE;
    // Samme !inner-regel som i loadBikes: sælgertype-filter på et left join
    // fjerner ikke rækkerne — det nuller kun profiles-objektet. !inner gør
    // .eq('profiles.seller_type', …) til et rigtigt filter.
    const fProfilesJoin = (sellerType && !dealerId) ? 'profiles!user_id!inner' : 'profiles!user_id';
    let query = supabase
      .from('bikes')
      .select(filterSelect(fProfilesJoin))
      .eq('is_active', true)
      .eq('category', category)
      .order('created_at', { ascending: false })
      .range(offset, offset + filterFetchCount - 1);

    query = applyFilterArgs(query, {
      types, conditions, minPrice, maxPrice, sellerType, dealerId,
      wheelSizes, sizes, colors, brands,
      frameMaterials, brakeTypes, groupsets, electronicShifting,
      motors, motorPositions, batteryMin, batteryMax,
      suspensions, geartypes, stepTypes,
      maxWeight, city, search, giveaway,
    });

    const { data, error } = await query;
    if (error) {
      grid.innerHTML = retryHTML('Kunne ikke hente annoncer.', 'applyFilters');
      return;
    }

    renderBikes(data || [], append);
    markSavedHearts((data || []).map(b => b.id));
    updateActiveFiltersBar();
    if (!append && !(data || []).length) {
      showNearMatch({
        types, conditions, minPrice, maxPrice, sellerType, dealerId,
        wheelSizes, sizes, colors, brands,
        frameMaterials, brakeTypes, groupsets, electronicShifting,
        motors, motorPositions, batteryMin, batteryMax,
        suspensions, geartypes, stepTypes,
        maxWeight, city, search, giveaway, category,
      });
    }
    // Send result-count til CTA — skifter copy til "Kun X matcher" når resultater er få
    if (!append) updateCykelagentCta((data || []).length);
    else updateCykelagentCta();
    setFilterOffset(getFilterOffset() + (data || []).length);

    const existing = document.getElementById('load-more-btn');
    if (existing) existing.remove();

    const dealerBanner = document.querySelector('.dealer-banner-mobile');
    const anchor = dealerBanner || document.getElementById('listings-map') || grid;
    if ((data || []).length === filterFetchCount) {
      const btn = document.createElement('div');
      btn.id = 'load-more-btn';
      btn.innerHTML = `<button onclick="loadMoreFilteredBikes()" style="display:block;margin:24px auto;padding:12px 32px;background:var(--forest);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">Vis flere cykler</button>`;
      anchor.after(btn);
    } else if (append && getFilterOffset() > BIKES_PAGE_SIZE) {
      const msg = document.createElement('div');
      msg.id = 'load-more-btn';
      msg.innerHTML = `<p style="text-align:center;color:var(--muted);padding:16px 0 24px;font-size:0.9rem;">Ingen flere cykler at vise</p>`;
      anchor.after(msg);
    }
  }

  return {
    loadBikes,
    renderBikes,
    renderListingsEmptyState,
    searchBikes,
    loadBikesWithFilters,
  };
}
