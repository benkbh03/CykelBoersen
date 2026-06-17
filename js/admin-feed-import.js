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
          </div>
          <p style="margin:0;color:var(--muted);font-size:0.78rem;line-height:1.4;">
            💡 Shopify-feeds viser butikkens egen valuta. Lad stå på <strong>auto</strong> — så
            registreres valutaen og priser omregnes til DKK. Vis forkerte priser? Vælg den rigtige valuta manuelt.
          </p>
          <button id="feed-add-btn" style="background:var(--forest);color:#fff;border:none;padding:11px 22px;border-radius:8px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;justify-self:start;">+ Gem feed</button>
        </div>
      </div>

      <div class="bulk-import-step" style="margin-top:28px;">
        <h3 style="margin:0 0 12px;font-family:'Fraunces',serif;">Eksisterende feeds (${_feeds.length})</h3>
        <div id="feed-list"></div>
      </div>

      <div id="feed-preview-section" style="margin-top:20px;"></div>
    `;

    document.getElementById('feed-add-btn').onclick = addFeed;
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
              <button data-act="sync" data-id="${esc(f.id)}" style="background:var(--rust);color:#fff;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.82rem;font-weight:600;">🔄 Synkronisér nu</button>
              <button data-act="toggle" data-id="${esc(f.id)}" style="background:none;border:1px solid var(--border);padding:8px 12px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.82rem;">${f.active ? 'Deaktivér' : 'Aktivér'}</button>
              <button data-act="delete" data-id="${esc(f.id)}" style="background:none;border:1px solid var(--border);color:#c8302a;padding:8px 12px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.82rem;">Slet</button>
            </div>
          </div>
        </div>`;
    }).join('');

    el.querySelectorAll('button[data-act]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        if (act === 'test') testFeed(id, btn);
        else if (act === 'sync') syncFeed(id, btn);
        else if (act === 'toggle') toggleFeed(id);
        else if (act === 'delete') deleteFeed(id);
      };
    });
  }

  async function addFeed() {
    const userId = document.getElementById('feed-dealer-select').value;
    const url = document.getElementById('feed-url-input').value.trim();
    const format = document.getElementById('feed-format-select').value;
    const defaultType = document.getElementById('feed-deftype-select').value || null;
    const currency = document.getElementById('feed-currency-select').value || 'auto';
    if (!userId) { showToast('⚠️ Vælg en forhandler'); return; }
    if (!/^https:\/\//.test(url)) { showToast('⚠️ Feed-URL skal starte med https://'); return; }

    const { error } = await supabase.from('dealer_feeds').insert({
      user_id: userId, feed_url: url, format, default_type: defaultType, currency, active: true,
    });
    if (error) { showToast('❌ Kunne ikke gemme: ' + error.message); return; }
    showToast('✓ Feed gemt — klik "Test" for at se cyklerne');
    document.getElementById('feed-url-input').value = '';
    await loadData();
    renderFeedList();
  }

  async function testFeed(id, btn) {
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Tester…';
    const section = document.getElementById('feed-preview-section');
    try {
      const { data, error } = await supabase.functions.invoke('import-dealer-feed', {
        body: { feed_id: id, preview: true },
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
        b.frame_material, b.groupset, b.wheel_size, b.motor,
        b.battery_wh ? b.battery_wh + ' Wh' : null,
        b.weight_kg ? b.weight_kg + ' kg' : null,
      ].filter(Boolean).join(' · ');
      section.innerHTML = `
        <div style="border:1px solid var(--border);border-radius:10px;padding:16px;background:var(--sand);">
          <h4 style="margin:0 0 4px;font-family:'Fraunces',serif;">Preview — ${data.total} cykler fundet${items.length < data.total ? ` (viser ${items.length})` : ''}</h4>
          <p style="margin:0 0 10px;font-size:0.8rem;color:${converted ? '#2e7d32' : 'var(--muted)'};">
            ${converted
              ? `💱 Butikkens valuta: <strong>${esc(cur)}</strong> — priser omregnet til DKK.`
              : `Priser i DKK.`}
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
                  <td style="padding:5px 8px;white-space:nowrap;">${b.price ? Number(b.price).toLocaleString('da-DK') + ' kr' : '—'}${(converted && b._rawPrice) ? `<br><span style="color:var(--muted);font-size:0.72rem;">(${Number(b._rawPrice).toLocaleString('da-DK')} ${esc(cur)})</span>` : ''}</td>
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

  async function syncFeed(id, btn) {
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Synkroniserer…';
    try {
      const { data, error } = await supabase.functions.invoke('import-dealer-feed', {
        body: { feed_id: id },
      });
      if (error) {
        let msg = 'Sync fejlede'; try { msg = (await error.context.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      if (data.error) throw new Error(data.error);
      showToast(`✓ ${data.created} oprettet · ${data.updated} opdateret${data.deactivated ? ` · ${data.deactivated} udsolgt` : ''}${data.failed ? ` · ${data.failed} fejlet` : ''}`);
      await loadData();
      renderFeedList();
    } catch (e) {
      showToast('❌ ' + (e.message || 'Sync fejlede'));
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
