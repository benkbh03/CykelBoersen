/* ============================================================
   DEALER FRESHNESS NUDGE — målrettet, ikke-nagende
   ============================================================
   Forhandlere glemmer at opdatere priser/lager. I stedet for et blankt
   "husk at opdatere"-modal ved hvert login, vises KUN de annoncer der
   faktisk er forældede (ikke opdateret i 60+ dage) med 1-klik-handlinger:
   "Aktuel" (nulstiller friskheds-uret), "Ret pris" eller "Deaktivér".

   Feed-styrede annoncer bumper updated_at hver nat → de bliver aldrig
   forældede og dukker derfor aldrig op her. Nudgen rammer kun manuelt
   vedligeholdte annoncer, og vises max én gang pr. session.
   ============================================================ */
import { supabase } from './supabase-client.js';
import { esc } from './utils.js';

const STALE_DAYS = 60;

export async function checkDealerFreshness(currentUser, currentProfile) {
  try {
    if (!currentUser || currentProfile?.seller_type !== 'dealer') return;
    const sessionKey = 'cb_freshness_shown_' + currentUser.id;
    if (sessionStorage.getItem(sessionKey)) return;

    const cutoff = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();
    const { data, error } = await supabase
      .from('bikes')
      .select('id, brand, model, price, updated_at, created_at')
      .eq('user_id', currentUser.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: true })
      .limit(40);
    if (error || !data) return;

    const stale = data.filter(b => (b.updated_at || b.created_at || '') < cutoff);
    if (stale.length === 0) return;

    sessionStorage.setItem(sessionKey, '1');  // vis kun én gang pr. session
    renderNudge(stale);
  } catch (_e) { /* nudge er ikke-kritisk — fejl ignoreres */ }
}

function ageDays(b) {
  return Math.floor((Date.now() - new Date(b.updated_at || b.created_at)) / 86400000);
}

function rowHtml(b) {
  return `
    <div class="dfn-row" data-id="${esc(b.id)}" style="border:1px solid var(--border,#e5e0d8);border-radius:8px;padding:8px 10px;">
      <div style="font-size:0.84rem;font-weight:600;color:var(--charcoal,#1a1a18);">${esc(b.brand || '')} ${esc(b.model || '')}</div>
      <div style="font-size:0.76rem;color:var(--muted,#6b6760);margin-bottom:6px;">${b.price ? Number(b.price).toLocaleString('da-DK') + ' kr' : ''} · ${ageDays(b)} dage siden</div>
      <div style="display:flex;gap:6px;">
        <button data-row-act="confirm" style="flex:1;background:none;border:1px solid var(--forest,#1f3d2b);color:var(--forest,#1f3d2b);padding:5px;border-radius:6px;cursor:pointer;font-size:0.76rem;">✓ Aktuel</button>
        <button data-row-act="edit" style="flex:1;background:none;border:1px solid var(--border,#e5e0d8);padding:5px;border-radius:6px;cursor:pointer;font-size:0.76rem;">Ret pris</button>
        <button data-row-act="deactivate" title="Deaktivér annonce" style="background:none;border:1px solid #c8302a;color:#c8302a;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:0.76rem;">Fjern</button>
      </div>
    </div>`;
}

async function bumpFresh(ids) {
  if (!ids.length) return;
  await supabase.from('bikes').update({ updated_at: new Date().toISOString() }).in('id', ids);
}

function renderNudge(stale) {
  if (document.getElementById('dealer-freshness-nudge')) return;
  const card = document.createElement('div');
  card.id = 'dealer-freshness-nudge';
  card.style.cssText = "position:fixed;bottom:20px;left:20px;z-index:4000;width:344px;max-width:calc(100vw - 32px);background:#fff;border:1px solid var(--border,#e5e0d8);border-radius:14px;box-shadow:0 12px 40px rgba(26,26,24,0.22);font-family:'DM Sans',sans-serif;overflow:hidden;animation:dfnIn .25s ease;";
  card.innerHTML = `
    <style>@keyframes dfnIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}</style>
    <div style="padding:13px 16px;background:linear-gradient(135deg,#1f3d2b,#a8521f);color:#fff;display:flex;justify-content:space-between;align-items:center;gap:10px;">
      <strong style="font-size:0.95rem;">🔄 Er priserne stadig aktuelle?</strong>
      <button data-act="close" aria-label="Luk" style="background:none;border:none;color:#fff;font-size:1.4rem;cursor:pointer;line-height:1;padding:0;">×</button>
    </div>
    <div style="padding:12px 16px;">
      <p style="margin:0 0 10px;font-size:0.84rem;color:var(--muted,#6b6760);line-height:1.5;">
        ${stale.length} ${stale.length === 1 ? 'annonce er' : 'annoncer er'} ikke opdateret i ${STALE_DAYS}+ dage. Bekræft at de stadig er aktuelle, eller deaktivér dem.
      </p>
      <div id="dfn-list" style="display:flex;flex-direction:column;gap:8px;max-height:240px;overflow:auto;">
        ${stale.map(rowHtml).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button data-act="confirm-all" style="flex:1;background:var(--forest,#1f3d2b);color:#fff;border:none;padding:9px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.82rem;">✓ Alle er aktuelle</button>
        <button data-act="close" style="background:none;border:1px solid var(--border,#e5e0d8);padding:9px 12px;border-radius:8px;cursor:pointer;font-size:0.82rem;">Senere</button>
      </div>
    </div>`;
  document.body.appendChild(card);

  const toast = (m) => { if (typeof window.showToast === 'function') window.showToast(m); };
  const close = () => card.remove();
  const dropRow = (row) => {
    row.remove();
    if (!card.querySelector('.dfn-row')) close();
  };

  card.querySelectorAll('[data-act="close"]').forEach(b => { b.onclick = close; });
  card.querySelector('[data-act="confirm-all"]').onclick = async () => {
    await bumpFresh(stale.map(b => b.id));
    close();
    toast('✓ Tak — dine annoncer er markeret som aktuelle');
  };

  card.querySelectorAll('.dfn-row').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('[data-row-act="confirm"]').onclick = async () => {
      await bumpFresh([id]); dropRow(row); toast('✓ Markeret som aktuel');
    };
    row.querySelector('[data-row-act="edit"]').onclick = () => {
      close();
      if (typeof window.openEditModal === 'function') window.openEditModal(id);
    };
    row.querySelector('[data-row-act="deactivate"]').onclick = async () => {
      await supabase.from('bikes').update({ is_active: false }).eq('id', id);
      dropRow(row); toast('Annonce deaktiveret');
    };
  });
}
