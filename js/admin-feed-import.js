/* ============================================================
   ADMIN FEED IMPORT — automatisk sync fra forhandlers webshop-feed
   ============================================================
   - Admin indsætter en forhandlers feed-URL (Google Shopping XML eller CSV)
   - "Test feed" → preview af de parsede cykler UDEN at skrive
   - "Synkronisér nu" → opretter/opdaterer cykler + deaktiverer udsolgte
   - Nattlig cron kører alle aktive feeds automatisk (pg_cron)
   Selve hentning/parsing/upsert sker i edge-functionen import-dealer-feed.
   ============================================================ */

import { esc } from './utils.js';

export function createAdminFeedImport({ supabase, showToast }) {
  let _dealers = [];
  let _feeds = [];

  const VALID_TYPES = ['Racercykel', 'Mountainbike', 'Citybike', 'El-cykel', 'Ladcykel', 'Børnecykel', 'Gravel', 'Senior cykel'];

  async function loadData() {
    const [dealersRes, feedsRes] = await Promise.all([
      supabase.from('profiles')
        .select('id, shop_name, name, city')
        .eq('seller_type', 'dealer')
        .eq('admin_can_create_listings', true)
        .order('shop_name', { ascending: true }),
      supabase.from('dealer_feeds')
        .select('*')
        .order('created_at', { ascending: false }),
    ]);
    _dealers = dealersRes.data || [];
    _feeds = feedsRes.data || [];
  }

  function dealerName(userId) {
    const d = _dealers.find(x => x.id === userId);
    return d ? (d.shop_name || d.name || 'Unavngivet') : userId.slice(0, 8) + '…';
  }

  async function renderFeedImportTab() {
    const container = document.getElementById('admin-feed-import');
    if (!container) return;
    container.innerHTML = `<p style="color:var(--muted)">Henter feeds…</p>`;
    await loadData();

    if (_dealers.length === 0) {
      container.innerHTML = `
        <div style="padding:24px;background:var(--sand);border-radius:10px;text-align:center;">
          <p style="margin:0 0 8px;font-weight:600;">Ingen forhandlere har aktiveret onboarding-service endnu</p>
          <p style="margin:0;color:var(--muted);font-size:0.9rem;">Forhandleren skal aktivere onboarding-tilladelse før du kan synkronisere deres feed.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="bulk-import-step">
        <h3 style="margin:0 0 6px;font-family:'Fraunces',serif;">Tilføj webshop-feed</h3>
        <p style="margin:0 0 12px;color:var(--muted);font-size:0.85rem;line-height:1.5;">
          Indsæt forhandlerens produkt-feed-URL (typisk Google Shopping XML fra deres webshop).
          Cyklerne synkroniseres automatisk hver nat — og du kan synkronisere manuelt med det samme.
        </p>
        <div style="display:grid;gap:10px;max-width:560px;">
          <select id="feed-dealer-select" style="padding:10px;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;">
            <option value="">— Vælg forhandler —</option>
            ${_dealers.map(d => `<option value="${esc(d.id)}">${esc(d.shop_name || d.name || 'Unavngivet')} ${d.city ? '(' + esc(d.city) + ')' : ''}</option>`).join('')}
          </select>
          <input type="url" id="feed-url-input" placeholder="Shopify: https://forhandler.dk/products.json" style="padding:10px;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;">
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <select id="feed-format-select" style="padding:10px;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;flex:1;min-width:160px;">
              <option value="shopify_json">Shopify (automatisk)</option>
              <option value="google_xml">Google Shopping XML</option>
              <option value="csv">CSV</option>
            </select>
            <select id="feed-deftype-select" style="padding:10px;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;flex:1;min-width:160px;">
              <option value="">Auto-gæt cykeltype</option>
              ${VALID_TYPES.map(t => `<option value="${t}">Default: ${t}</option>`).join('')}
            </select>
            <select id="feed-currency-select" title="Butikkens valuta — priser omregnes til DKK" style="padding:10px;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;flex:1;min-width:160px;">
              <option value="auto">Valuta: auto-registrér</option>
              <option value="DKK">DKK (kr)</option>
              <option value="EUR">EUR → DKK</option>
              <option value="SEK">SEK → DKK</option>
              <option value="NOK">NOK → DKK</option>
              <option value="USD">USD → DKK</option>
              <option value="GBP">GBP → DKK</option>
            </select>
            <select id="feed-round-select" title="Afrund omregnede priser til butikkens pris-mønster" style="padding:10px;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;flex:1;min-width:160px;">
              <option value="none">Afrunding: ingen</option>
              <option value="99">Afrund til x99 (fx 4.699)</option>
              <option value="95">Afrund til x95</option>
              <option value="50">Afrund til nærmeste 50</option>
              <option value="100">Afrund til nærmeste 100</option>
            </select>
          </div>
          <p style="margin:0;color:var(--muted);font-size:0.78rem;line-height:1.4;">
            💡 Shopify-feeds viser butikkens egen valuta efter geo-IP. Lad stå på <strong>auto</strong>.
            Hvis butikken kun har udenlandsk valuta (fx EUR), omregnes der til DKK — vælg da <strong>afrunding</strong>
            der matcher butikkens priser (de fleste ender på x99), så fx 4.692 → 4.699. Afrunding rører kun omregnede priser.
          </p>
          <button id="feed-add-btn" style="background:var(--forest);color:#fff;border:none;padding:11px 22px;border-radius:8px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;justify-self:start;">+ Gem feed</button>
        </div>
      </div>

      <div class="bulk-import-step" style="margin-top:24px;">
        <h3 style="margin:0 0 4px;font-family:'Fraunces',serif;">🔍 Test en vilkårlig butik</h3>
        <p style="margin:0 0 10px;color:var(--muted);font-size:0.82rem;line-height:1.5;">
          Indsæt enhver Shopify <code>products.json</code>-URL for at se hvordan den parses — <strong>skriver intet, kræver ingen forhandler</strong>. Perfekt til at tjekke en butik før du onboarder dem.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;max-width:560px;">
          <input type="url" id="feed-test-url-input" placeholder="https://butik.dk/products.json" style="flex:1;min-width:220px;padding:10px;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;">
          <select id="feed-test-format-select" style="padding:10px;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;">
            <option value="shopify_json">Shopify</option>
            <option value="google_xml">Google XML</option>
            <option value="csv">CSV</option>
          </select>
          <button id="feed-test-url-btn" style="background:none;border:1px solid var(--forest);color:var(--forest);padding:10px 16px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.88rem;font-weight:600;">🔍 Test URL</button>
        </div>
      </div>

      <div class="bulk-import-step" style="margin-top:28px;">
        <h3 style="margin:0 0 12px;font-family:'Fraunces',serif;">Eksisterende feeds (${_feeds.length})</h3>
        <div id="feed-list"></div>
      </div>

      <div id="feed-preview-section" style="margin-top:20px;"></div>
    `;

    document.getElementById('feed-add-btn').onclick = addFeed;
    document.getElementById('feed-test-url-btn').onclick = testArbitraryUrl;
    renderFeedList();
  }

  function renderFeedList() {
    const el = document.getElementById('feed-list');
    if (!el) return;
    if (_feeds.length === 0) {
      el.innerHTML = `<p style="color:var(--muted);font-size:0.88rem;">Ingen feeds endnu. Tilføj én ovenfor.</p>`;
      return;
    }
    el.innerHTML = _feeds.map(f => {
      const synced = f.last_synced_at
        ? new Date(f.last_synced_at).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' })
        : 'aldrig';
      const statusOk = f.last_status === 'ok' || !f.last_status;
      return `
        <div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;background:#fff;">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;">
            <div style="min-width:0;flex:1;">
              <div style="font-weight:600;">${esc(dealerName(f.user_id))} ${f.active ? '' : '<span style="color:var(--muted);font-weight:400;">(inaktiv)</span>'}</div>
              <div style="color:var(--muted);font-size:0.8rem;word-break:break-all;">${esc(f.feed_url)}</div>
              <div style="font-size:0.8rem;margin-top:4px;">
                <span style="color:var(--muted);">${esc(f.format)}${f.currency && f.currency !== 'auto' && f.currency !== 'DKK' ? ' · ' + esc(f.currency) + '→DKK' : ''} · sidst synket: ${synced}</span>
                ${f.last_status ? `<span style="display:block;margin-top:2px;color:${statusOk ? '#2e7d32' : '#c8302a'};">${statusOk ? `✓ ${f.last_count ?? 0} cykler${f.last_deactivated ? ` · ${f.last_deactivated} deaktiveret` : ''}` : '✗ ' + esc(f.last_status)}</span>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button data-act="test" data-id="${esc(f.id)}" style="background:none;border:1px solid var(--border);padding:8px 12px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.82rem;">🔍 Test</button>
              <button data-act="draft" data-id="${esc(f.id)}" title="Importér cyklerne SKJULT (inaktive), så du kan rette dem før kunderne ser dem" style="background:none;border:1px solid var(--forest);color:var(--forest);padding:8px 12px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.82rem;font-weight:600;">📥 Importér som kladde</button>
              <button data-act="review" data-id="${esc(f.id)}" title="Gennemgå og udgiv de skjulte (kladde) cykler" style="background:none;border:1px solid var(--border);padding:8px 12px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.82rem;">👁 Gennemgå &amp; udgiv</button>
              <button data-act="sync" data-id="${esc(f.id)}" title="Synkronisér og udgiv med det samme (cyklerne bliver live nu)" style="background:var(--rust);color:#fff;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.82rem;font-weight:600;">🔄 Synkronisér nu</button>
              <button data-act="remove" data-id="${esc(f.id)}" title="Skjul alle cykler importeret fra dette feed" style="background:none;border:1px solid #c8302a;color:#c8302a;padding:8px 12px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.82rem;">🗑️ Fjern cykler</button>
              <button data-act="toggle" data-id="${esc(f.id)}" style="background:none;border:1px solid var(--border);padding:8px 12px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.82rem;">${f.active ? 'Deaktivér' : 'Aktivér'}</button>
              <button data-act="delete" data-id="${esc(f.id)}" style="background:none;border:1px solid var(--border);color:#c8302a;padding:8px 12px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.82rem;">Slet</button>
            </div>
          </div>
          <div id="feed-review-${esc(f.id)}" data-open="0" style="display:none;"></div>
        </div>`;
    }).join('');

    el.querySelectorAll('button[data-act]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        if (act === 'test') testFeed(id, btn);
        else if (act === 'sync') syncFeed(id, btn);
        else if (act === 'draft') syncFeed(id, btn, true);
        else if (act === 'review') reviewFeedBikes(id, btn);
        else if (act === 'remove') removeFeedBikes(id, btn);
        else if (act === 'toggle') toggleFeed(id);
        else if (act === 'delete') deleteFeed(id);
      };
    });
  }

  async function removeFeedBikes(id, btn) {
    const f = _feeds.find(x => x.id === id);
    if (!f) { showToast('❌ Feed ikke fundet'); return; }
    if (!confirm('Fjern (skjul) ALLE cykler importeret fra dette feed?\n\nDe deaktiveres — manuelt oprettede annoncer røres ikke. Du kan altid synkronisere dem ind igen.')) return;
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Fjerner…';
    try {
      // SECURITY DEFINER RPC (omgår RLS med internt admin-tjek) — virker uden
      // edge-deploy. Kræver SQL'en add_remove_dealer_feed_bikes.sql er kørt.
      const { data, error } = await supabase.rpc('remove_dealer_feed_bikes', { p_user_id: f.user_id });
      if (error) throw new Error(error.message || 'Kunne ikke fjerne');
      showToast(`✓ ${data ?? 0} cykler fjernet (deaktiveret)`);
    } catch (e) {
      showToast('❌ ' + (e.message || 'Kunne ikke fjerne'));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  async function addFeed() {
    const userId = document.getElementById('feed-dealer-select').value;
    const url = document.getElementById('feed-url-input').value.trim();
    const format = document.getElementById('feed-format-select').value;
    const defaultType = document.getElementById('feed-deftype-select').value || null;
    const currency = document.getElementById('feed-currency-select').value || 'auto';
    const priceRound = document.getElementById('feed-round-select').value || 'none';
    if (!userId) { showToast('⚠️ Vælg en forhandler'); return; }
    if (!/^https:\/\//.test(url)) { showToast('⚠️ Feed-URL skal starte med https://'); return; }

    const { error } = await supabase.from('dealer_feeds').insert({
      user_id: userId, feed_url: url, format, default_type: defaultType, currency, price_round: priceRound, active: true,
    });
    if (error) { showToast('❌ Kunne ikke gemme: ' + error.message); return; }
    showToast('✓ Feed gemt — klik "Test" for at se cyklerne');
    document.getElementById('feed-url-input').value = '';
    await loadData();
    renderFeedList();
  }

  function testFeed(id, btn) { return runPreview({ feed_id: id, preview: true }, btn); }

  function testArbitraryUrl() {
    const url = document.getElementById('feed-test-url-input').value.trim();
    const format = document.getElementById('feed-test-format-select')?.value || 'shopify_json';
    if (!/^https:\/\//.test(url)) { showToast('⚠️ URL skal starte med https://'); return; }
    runPreview({ test_url: url, test_format: format, preview: true }, document.getElementById('feed-test-url-btn'));
  }

  async function runPreview(invokeBody, btn) {
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Tester…';
    const section = document.getElementById('feed-preview-section');
    try {
      const { data, error } = await supabase.functions.invoke('import-dealer-feed', {
        body: invokeBody,
      });
      if (error) {
        let msg = 'Test fejlede'; try { msg = (await error.context.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      if (data.error) throw new Error(data.error);
      const items = data.items || [];
      const cur = data.currency || 'DKK';
      const converted = cur && cur !== 'DKK';
      const specSummary = (b) => [
        b.year,
        (Array.isArray(b.colors) && b.colors.length) ? b.colors.join('/') : (b.color || null),
        b.frame_material,
        b.wheel_size,
        b.size_cm ? b.size_cm + ' cm' : null,
        b.groupset,
        b.brake_type,
        b.geartype ? b.geartype + ' gear' : null,
        b.step_type,
        b.suspension,
        b.motor,
        b.motor_position,
        b.battery_wh ? b.battery_wh + ' Wh' : null,
        b.weight_kg ? b.weight_kg + ' kg' : null,
      ].filter(Boolean).join(' · ');
      section.innerHTML = `
        <div style="border:1px solid var(--border);border-radius:10px;padding:16px;background:var(--sand);">
          <h4 style="margin:0 0 4px;font-family:'Fraunces',serif;">Preview — ${data.total} cykler fundet${items.length < data.total ? ` (viser ${items.length})` : ''}</h4>
          <p style="margin:0 0 10px;font-size:0.8rem;color:${converted ? '#b8860b' : '#2e7d32'};">
            ${converted
              ? `⚠️ Butikkens valuta er <strong>${esc(cur)}</strong> — priser er <strong>ca.-omregnet</strong> til DKK (ikke butikkens eksakte danske priser). For præcise priser: brug butikkens danske markeds-URL, fx <code>…/en-dk/products.json</code>.`
              : `✓ Priser i DKK — butikkens eksakte priser.`}
          </p>
          <div style="max-height:340px;overflow:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
              <thead><tr style="text-align:left;">
                <th style="padding:6px 8px;border-bottom:1px solid var(--border);">Varenr.</th>
                <th style="padding:6px 8px;border-bottom:1px solid var(--border);">Cykel</th>
                <th style="padding:6px 8px;border-bottom:1px solid var(--border);">Type</th>
                <th style="padding:6px 8px;border-bottom:1px solid var(--border);">Pris</th>
                <th style="padding:6px 8px;border-bottom:1px solid var(--border);">Udfyldte specs</th>
              </tr></thead>
              <tbody>
                ${items.map(b => `<tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:5px 8px;color:var(--muted);">${esc(b.external_id || '—')}</td>
                  <td style="padding:5px 8px;">${esc(b.brand || '')} ${esc(b.model || '')}</td>
                  <td style="padding:5px 8px;">${esc(b.type || '')}</td>
                  <td style="padding:5px 8px;white-space:nowrap;">${b.price ? Number(b.price).toLocaleString('da-DK') + ' kr' : '—'}${(b.original_price && b.original_price > b.price) ? `<br><span style="text-decoration:line-through;color:var(--muted);font-size:0.72rem;">${Number(b.original_price).toLocaleString('da-DK')} kr</span>` : ''}${(converted && b._rawPrice) ? `<br><span style="color:var(--muted);font-size:0.72rem;">(${Number(b._rawPrice).toLocaleString('da-DK')} ${esc(cur)})</span>` : ''}</td>
                  <td style="padding:5px 8px;color:var(--muted);font-size:0.76rem;">${esc(specSummary(b) || '—')}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <p style="margin:10px 0 0;color:var(--muted);font-size:0.8rem;">Ser det rigtigt ud? Klik "🔄 Synkronisér nu" på feedet for at oprette/opdatere cyklerne.</p>
        </div>`;
      section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      showToast('❌ ' + (e.message || 'Test fejlede'));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  async function syncFeed(id, btn, draft = false) {
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = draft ? 'Importerer skjult…' : 'Synkroniserer…';
    try {
      const { data, error } = await supabase.functions.invoke('import-dealer-feed', {
        body: { feed_id: id, draft },
      });
      if (error) {
        let msg = 'Sync fejlede'; try { msg = (await error.context.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      if (data.error) throw new Error(data.error);
      showToast(draft
        ? `✓ ${data.created} importeret som kladde (skjult) · ${data.updated} opdateret. Klik "👁 Gennemgå & udgiv" for at rette og udgive.`
        : `✓ ${data.created} oprettet · ${data.updated} opdateret${data.deactivated ? ` · ${data.deactivated} udsolgt` : ''}${data.failed ? ` · ${data.failed} fejlet` : ''}`);
      await loadData();
      renderFeedList();
    } catch (e) {
      showToast('❌ ' + (e.message || 'Sync fejlede'));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  // Kompakt liste over de specs en feed-cykel HAR udfyldt — så admin på et blik
  // kan se om der mangler noget og om den trænger til redigering.
  function feedBikeSpecs(b) {
    const p = [];
    if (b.color)                       p.push(esc(b.color));
    if (b.wheel_size)                  p.push(esc(b.wheel_size));
    if (b.size_cm)                     p.push(b.size_cm + ' cm');
    else if (b.size)                   p.push(esc(b.size));
    if (b.frame_material)              p.push(esc(b.frame_material));
    if (b.groupset)                    p.push(esc(b.groupset));
    if (b.brake_type)                  p.push(esc(b.brake_type));
    if (b.electronic_shifting === true)  p.push('Elektronisk gear');
    else if (b.electronic_shifting === false) p.push('Mekanisk gear');
    if (b.geartype)                    p.push(esc(b.geartype) + ' gear');
    if (b.motor)                       p.push('⚡ ' + esc(b.motor));
    if (b.battery_wh)                  p.push(b.battery_wh + ' Wh');
    if (b.suspension)                  p.push(esc(b.suspension));
    if (b.step_type)                   p.push(esc(b.step_type));
    if (b.weight_kg)                   p.push(Number(b.weight_kg).toFixed(1).replace('.', ',') + ' kg');
    if (b.condition)                   p.push(esc(b.condition));
    if (b.year)                        p.push(String(b.year));
    if (b.warranty)                    p.push('🛡️ ' + esc(b.warranty));
    return p;
  }

  // Gennemgå skjulte (kladde) cykler fra et feed: liste med redigér-knapper +
  // "Aktivér alle". Vises under feed-kortet i en udklappelig boks.
  async function reviewFeedBikes(id, btn) {
    const f = _feeds.find(x => x.id === id);
    if (!f) { showToast('❌ Feed ikke fundet'); return; }
    const box = document.getElementById(`feed-review-${id}`);
    if (!box) return;
    if (box.dataset.open === '1') { box.style.display = 'none'; box.dataset.open = '0'; return; }
    box.style.display = 'block'; box.dataset.open = '1';
    box.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:8px 0;">Henter cykler…</p>';
    // SECURITY DEFINER RPC (omgår RLS, admin-tjek internt) — viser ALLE feed-
    // cykler for forhandleren, både live og skjulte. Kræver SQL'en
    // add_list_dealer_feed_bikes.sql.
    const { data: bikes, error } = await supabase.rpc('list_dealer_feed_bikes', { p_user_id: f.user_id });
    if (error) {
      box.innerHTML = `<p style="color:#c8302a;font-size:0.85rem;">Kunne ikke hente cykler: ${esc(error.message || 'fejl')}. Har du kørt add_list_dealer_feed_bikes.sql?</p>`;
      return;
    }
    if (!bikes || bikes.length === 0) {
      box.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:8px 0;">Ingen feed-cykler fundet for denne forhandler endnu. Importér feedet først.</p>';
      return;
    }
    const hiddenCount = bikes.filter(b => !b.is_active).length;
    const rows = bikes.map(b => {
      const specs = feedBikeSpecs(b);
      const specHtml = specs.length
        ? specs.map(s => `<span style="display:inline-block;background:#fff;border:1px solid var(--border);border-radius:5px;padding:1px 6px;margin:2px 3px 0 0;font-size:0.72rem;">${s}</span>`).join('')
        : '<span style="color:#c8302a;font-size:0.74rem;">⚠ ingen specs udfyldt — trænger til redigering</span>';
      return `
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="min-width:0;flex:1;">
          <div style="font-size:0.85rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            <span title="${b.is_active ? 'Live (synlig)' : 'Skjult'}">${b.is_active ? '🟢' : '⚪'}</span>
            ${esc((b.brand || '') + ' ' + (b.model || ''))}${b.feed_locked ? ' <span title="Låst — sync rører kun pris" style="color:var(--forest);">🔒</span>' : ''}
          </div>
          <div style="font-size:0.76rem;color:var(--muted);margin-top:1px;">${esc(b.type || '— ingen type')} · ${b.price ? Number(b.price).toLocaleString('da-DK') + ' kr' : '—'}</div>
          <div style="margin-top:2px;">${specHtml}</div>
        </div>
        <button onclick="openEditModal('${esc(b.id)}')" style="background:none;border:1px solid var(--border);padding:6px 10px;border-radius:7px;cursor:pointer;font-size:0.78rem;white-space:nowrap;">✏️ Redigér</button>
      </div>`;
    }).join('');
    box.innerHTML = `
      <div style="background:var(--sand);border-radius:8px;padding:10px 12px;margin-top:8px;">
        <div style="font-size:0.82rem;font-weight:600;margin-bottom:6px;">${bikes.length} feed-cykler (🟢 live · ⚪ skjult) — ret dem her, udgiv når du er klar</div>
        <div style="max-height:340px;overflow-y:auto;">${rows}</div>
        <button id="feed-activate-${id}" style="margin-top:10px;width:100%;background:var(--forest);color:#fff;border:none;padding:9px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600;font-size:0.85rem;">✅ Udgiv alle skjulte${hiddenCount ? ` (${hiddenCount})` : ''}</button>
      </div>`;
    const actBtn = document.getElementById(`feed-activate-${id}`);
    if (actBtn) actBtn.onclick = () => activateFeedBikes(id, actBtn);
  }

  async function activateFeedBikes(id, btn) {
    const f = _feeds.find(x => x.id === id);
    if (!f) { showToast('❌ Feed ikke fundet'); return; }
    if (!confirm('Udgiv alle skjulte cykler fra dette feed?\n\nDe bliver synlige for kunderne med det samme.')) return;
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Udgiver…';
    try {
      // SECURITY DEFINER RPC — kræver SQL'en add_activate_dealer_feed_bikes.sql.
      const { data, error } = await supabase.rpc('activate_dealer_feed_bikes', { p_user_id: f.user_id });
      if (error) throw new Error(error.message || 'Kunne ikke udgive');
      showToast(`✓ ${data ?? 0} cykler udgivet (synlige nu)`);
      const box = document.getElementById(`feed-review-${id}`);
      if (box) { box.style.display = 'none'; box.dataset.open = '0'; }
    } catch (e) {
      showToast('❌ ' + (e.message || 'Kunne ikke udgive'));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  async function toggleFeed(id) {
    const f = _feeds.find(x => x.id === id);
    if (!f) return;
    await supabase.from('dealer_feeds').update({ active: !f.active }).eq('id', id);
    await loadData();
    renderFeedList();
  }

  async function deleteFeed(id) {
    if (!confirm('Slet denne feed-konfiguration? Cyklerne der allerede er importeret påvirkes ikke.')) return;
    await supabase.from('dealer_feeds').delete().eq('id', id);
    showToast('Feed slettet');
    await loadData();
    renderFeedList();
  }

  return { renderFeedImportTab, loadFeedImportTab: renderFeedImportTab };
}
