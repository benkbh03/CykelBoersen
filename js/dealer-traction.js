/* ────────────────────────────────────────────────────────────────
   dealer-traction.js — får forhandlerne rent faktisk kunder?

   Det tal der afgør hvornår der kan tages betaling. En forhandler med 60
   annoncer og nul henvendelser betaler ikke, uanset hvor mange andre
   forhandlere der er på platformen. En der får fem henvendelser om måneden
   gør, selv hvis de er den eneste.

   Signalet ligger altså på efterspørgselssiden, ikke i antallet af butikker.
   Derfor har det sin egen fane frem for at ligge nede i statistikken sammen
   med alt muligt andet: det er ikke en tal-oversigt, det er et
   beslutningsgrundlag, og det skal kunne åbnes uden at lede.

   Henvendelser er den eneste kolonne der afgør noget. Visninger er kontekst.
──────────────────────────────────────────────────────────────── */

export function createDealerTraction({ supabase, esc, retryHTML }) {
  const DAYS = 30;

  async function loadDealerTraction() {
    const el = document.getElementById('admin-traction');
    if (!el) return;
    el.innerHTML = '<p style="color:var(--muted)">Indlæser…</p>';

    try {
      const since = new Date(Date.now() - (DAYS - 1) * 86400000);
      since.setHours(0, 0, 0, 0);
      const sinceIso = since.toISOString();

      const [profRes, bikeRes, viewRes, msgRes] = await Promise.all([
        supabase.from('profiles').select('id, shop_name, name, verified').eq('seller_type', 'dealer'),
        supabase.from('bikes').select('id, user_id, is_active'),
        supabase.from('bike_views').select('bike_id').gte('viewed_at', sinceIso),
        supabase.from('messages').select('sender_id, receiver_id').gte('created_at', sinceIso),
      ]);

      const dealers = profRes.data || [];
      const bikes   = bikeRes.data || [];
      const views   = viewRes.data || [];
      const msgs    = msgRes.data  || [];

      const bikesByOwner = new Map();   // user_id -> antal aktive
      const ownerOfBike  = new Map();   // bike_id  -> user_id
      bikes.forEach(b => {
        if (!b.id || !b.user_id) return;
        ownerOfBike.set(b.id, b.user_id);
        if (b.is_active) bikesByOwner.set(b.user_id, (bikesByOwner.get(b.user_id) || 0) + 1);
      });

      const viewsByOwner = new Map();
      views.forEach(v => {
        const owner = ownerOfBike.get(v.bike_id);
        if (owner) viewsByOwner.set(owner, (viewsByOwner.get(owner) || 0) + 1);
      });

      /* Unikke afsendere pr. modtager. Fem beskeder fra samme person er ÉN
         interesseret køber, ikke fem — uden den skelnen får én ivrig prutter
         en butik til at se ud som en succes. */
      const msgCount = new Map();
      const buyers   = new Map();
      msgs.forEach(m => {
        if (!m.receiver_id) return;
        msgCount.set(m.receiver_id, (msgCount.get(m.receiver_id) || 0) + 1);
        if (!buyers.has(m.receiver_id)) buyers.set(m.receiver_id, new Set());
        buyers.get(m.receiver_id).add(m.sender_id);
      });

      const rows = dealers.map(d => ({
        name:     d.shop_name || d.name || 'Uden navn',
        verified: d.verified,
        listings: bikesByOwner.get(d.id) || 0,
        views:    viewsByOwner.get(d.id) || 0,
        msgs:     msgCount.get(d.id) || 0,
        buyers:   (buyers.get(d.id) || new Set()).size,
      })).sort((a, b) => b.msgs - a.msgs || b.views - a.views);

      const contacted = rows.filter(d => d.msgs > 0).length;
      const totalMsgs = rows.reduce((s, d) => s + d.msgs, 0);
      const noViewData = rows.length > 0 && rows.every(d => d.views === 0);

      if (!rows.length) {
        el.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;">Ingen forhandlere endnu.</p>';
        return;
      }

      const card = (value, label, sub, accent) => `
        <div style="background:var(--sand);border:1px solid var(--border);border-radius:12px;padding:14px 16px;">
          <div style="font-family:'Fraunces',serif;font-size:1.7rem;line-height:1;color:${accent || 'var(--charcoal)'};">${value}</div>
          <div style="font-size:0.82rem;color:var(--charcoal);margin-top:6px;font-weight:600;">${label}</div>
          ${sub ? `<div style="font-size:0.76rem;color:var(--muted);margin-top:2px;">${sub}</div>` : ''}
        </div>`;

      el.innerHTML = `
        <p style="font-size:0.88rem;color:var(--charcoal);margin:0 0 14px;line-height:1.55;">
          Henvendelser er beviset for at platformen sender forhandlerne kunder.
          Det er dét tal der afgør hvornår der kan tages betaling — ikke antallet af butikker.
        </p>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
          ${card(`${contacted}/${rows.length}`, 'Forhandlere kontaktet', `seneste ${DAYS} dage`, contacted > 0 ? 'var(--forest)' : 'var(--muted)')}
          ${card(totalMsgs, 'Henvendelser i alt', `seneste ${DAYS} dage`)}
          ${card(rows.reduce((s, d) => s + d.listings, 0), 'Aktive annoncer', 'fra forhandlere')}
        </div>

        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.86rem;min-width:460px;">
            <tr style="border-bottom:1.5px solid var(--border);text-align:left;">
              <th style="padding:6px 8px 6px 0;font-weight:600;">Forhandler</th>
              <th style="padding:6px 8px;font-weight:600;text-align:right;">Annoncer</th>
              <th style="padding:6px 8px;font-weight:600;text-align:right;">Visninger</th>
              <th style="padding:6px 8px;font-weight:600;text-align:right;">Henvendelser</th>
              <th style="padding:6px 0 6px 8px;font-weight:600;text-align:right;">Købere</th>
            </tr>
            ${rows.map(d => `
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 8px 8px 0;">${esc(d.name)}${d.verified ? '' : ' <span style="color:var(--muted);font-size:0.76rem;">(afventer)</span>'}</td>
                <td style="padding:8px;text-align:right;color:var(--muted);">${d.listings}</td>
                <td style="padding:8px;text-align:right;color:var(--muted);">${d.views.toLocaleString('da-DK')}</td>
                <td style="padding:8px;text-align:right;font-weight:700;color:${d.msgs > 0 ? 'var(--forest)' : 'var(--muted)'};">${d.msgs}</td>
                <td style="padding:8px 0 8px 8px;text-align:right;color:var(--muted);">${d.buyers}</td>
              </tr>`).join('')}
          </table>
        </div>

        <p style="font-size:0.78rem;color:var(--muted);margin-top:14px;line-height:1.5;">
          Købere tæller <strong>unikke afsendere</strong> — fem beskeder fra samme person er én interesseret køber.
          Inaktive annoncer og private sælgere er ikke med.
          ${noViewData ? '<br><strong style="color:var(--rust);">Visninger står på 0 for alle:</strong> kør <strong>supabase/sql/add_bike_views_admin_select.sql</strong> i SQL Editor. Tallet er ikke udtryk for at ingen så dem.' : ''}
        </p>

        <p style="font-size:0.78rem;color:var(--muted);margin-top:10px;line-height:1.5;">
          <strong style="color:var(--charcoal);">Sådan bruges den:</strong> når de fleste forhandlere har fået henvendelser,
          og tallene ikke er pinlige at vise frem, er tidspunktet inde. Start oppefra i tabellen —
          de siger ja fordi tallene taler for dem selv, og du lærer indvendingerne billigt.
        </p>
      `;
    } catch (e) {
      console.error('loadDealerTraction fejl:', e);
      el.innerHTML = retryHTML('Kunne ikke hente forhandler-data.', 'loadDealerTraction');
    }
  }

  return { loadDealerTraction };
}
