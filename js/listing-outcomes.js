/* ────────────────────────────────────────────────────────────────
   listing-outcomes.js — bliver cyklerne solgt, eller giver folk op?

   En markedsplads har præcis ét succesmål, og det er dette. Sælges der, er
   problemet for lidt udbud, og så skal al tid gå til at skaffe flere cykler.
   Gives der op, er problemet for få købere, og så gør flere cykler det
   faktisk værre, fordi endnu flere sælgere oplever at der ikke sker noget.
   De to kræver stik modsatte handlinger, og derfor har tallet sin egen fane
   i stedet for at ligge nede i statistikken sammen med alt muligt andet.

   Tre udfald kan skelnes, jf. supabase/sql/add_deleted_at.sql:
     sold_via sat                       -> solgt
     deleted_at sat, sold_via NULL      -> fjernet uden salg
     ingen af delene, is_active = false -> skjult/deaktiveret (feed, admin)

   Det sidste er IKKE et udfald og tælles derfor for sig: en forhandler hvis
   feed rydder op har ikke opgivet noget. Blandes de sammen, ser siden ud til
   at fejle langt mere end den gør.
──────────────────────────────────────────────────────────────── */

export function createListingOutcomes({ supabase, esc, retryHTML }) {
  const DAYS = 90;

  async function loadListingOutcomes() {
    const el = document.getElementById('admin-outcomes');
    if (!el) return;
    el.innerHTML = '<p style="color:var(--muted)">Indlæser…</p>';

    try {
      const since = new Date(Date.now() - DAYS * 86400000).toISOString();

      const [allRes, recentRes] = await Promise.all([
        supabase.from('bikes')
          .select('id, is_active, sold_via, deleted_at, created_at')
          .limit(5000),
        supabase.from('bikes')
          .select('brand, model, price, sold_via, deleted_at, created_at, profiles!user_id(name, shop_name, seller_type)')
          .not('deleted_at', 'is', null)
          .gte('deleted_at', since)
          .order('deleted_at', { ascending: false })
          .limit(40),
      ]);

      if (allRes.error) throw allRes.error;
      const rows = allRes.data || [];

      const solgt      = rows.filter(b => b.sold_via).length;
      const opgivet    = rows.filter(b => b.deleted_at && !b.sold_via).length;
      const skjult     = rows.filter(b => !b.deleted_at && !b.sold_via && !b.is_active).length;
      const aktive     = rows.filter(b => b.is_active).length;
      const afsluttede = solgt + opgivet;

      // Salgsandel regnes KUN på annoncer der har fået et udfald. Tager man
      // de aktive med, falder tallet hver gang nogen lægger en ny cykel op,
      // og så måler man tilgang i stedet for succes.
      const andel = afsluttede ? Math.round((solgt / afsluttede) * 100) : null;

      // Liggetid: hvor længe gik der fra oprettelse til den blev fjernet?
      const dage = rows
        .filter(b => b.deleted_at && b.created_at)
        .map(b => (new Date(b.deleted_at) - new Date(b.created_at)) / 86400000)
        .filter(d => d >= 0)
        .sort((a, b) => a - b);
      const median = dage.length ? Math.round(dage[Math.floor(dage.length / 2)]) : null;

      el.innerHTML =
        renderHeadline(andel, solgt, opgivet, median) +
        renderBar(solgt, opgivet) +
        renderCounts(aktive, solgt, opgivet, skjult) +
        renderRecent(recentRes.error ? null : recentRes.data);
    } catch (err) {
      console.error(err);
      const mangler = /deleted_at/.test(err?.message || '');
      el.innerHTML = mangler
        ? '<p style="color:var(--rust);line-height:1.6;">Kolonnen <code>deleted_at</code> findes ikke endnu.<br>'
          + 'Kør <code>supabase/sql/add_deleted_at.sql</code> i SQL Editor først.</p>'
        : retryHTML('Kunne ikke hente udfald.', 'loadListingOutcomes');
    }
  }

  function renderHeadline(andel, solgt, opgivet, median) {
    if (andel === null) {
      return '<div style="padding:20px;background:var(--sand);border-radius:12px;margin-bottom:18px;">'
        + '<p style="margin:0;color:var(--muted);line-height:1.6;">Ingen annoncer har fået et udfald endnu.<br>'
        + 'Tallet dukker op så snart nogen fjerner eller sælger en annonce.</p></div>';
    }
    const farve = andel >= 50 ? 'var(--forest)' : andel >= 25 ? '#B8860B' : 'var(--rust)';
    return `
      <div style="padding:22px;background:var(--sand);border-radius:12px;margin-bottom:18px;">
        <div style="font-family:'Fraunces',serif;font-size:2.6rem;font-weight:900;line-height:1;color:${farve};">${andel} %</div>
        <div style="font-size:0.9rem;color:var(--charcoal);margin-top:6px;">af afsluttede annoncer blev solgt</div>
        <div style="font-size:0.8rem;color:var(--muted);margin-top:4px;">
          ${solgt} solgt · ${opgivet} fjernet uden salg${median !== null ? ` · median liggetid ${median} dage` : ''}
        </div>
      </div>`;
  }

  function renderBar(solgt, opgivet) {
    const i = solgt + opgivet;
    if (!i) return '';
    const p = (solgt / i) * 100;
    return `
      <div style="display:flex;height:26px;border-radius:8px;overflow:hidden;margin-bottom:8px;background:var(--border);">
        <div style="width:${p}%;background:var(--forest);"></div>
        <div style="width:${100 - p}%;background:var(--rust);"></div>
      </div>
      <div style="display:flex;gap:18px;font-size:0.78rem;color:var(--muted);margin-bottom:22px;">
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--forest);margin-right:5px;"></span>Solgt</span>
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--rust);margin-right:5px;"></span>Fjernet uden salg</span>
      </div>`;
  }

  function renderCounts(aktive, solgt, opgivet, skjult) {
    const kort = (tal, tekst, note) => `
      <div style="flex:1 1 120px;padding:14px;border:1px solid var(--border);border-radius:10px;">
        <div style="font-family:'Fraunces',serif;font-size:1.5rem;font-weight:700;">${tal}</div>
        <div style="font-size:0.8rem;color:var(--charcoal);margin-top:2px;">${tekst}</div>
        <div style="font-size:0.72rem;color:var(--muted);margin-top:3px;line-height:1.35;">${note}</div>
      </div>`;
    return `
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:26px;">
        ${kort(aktive,  'Aktive',            'Ligger på siden nu')}
        ${kort(solgt,   'Solgt',             'Via platformen eller eksternt')}
        ${kort(opgivet, 'Fjernet uden salg', 'Brugeren tog den ned')}
        ${kort(skjult,  'Deaktiveret',       'Feed-oprydning og admin. Tæller ikke som opgivet')}
      </div>`;
  }

  function renderRecent(rows) {
    if (!rows) return '<p style="color:var(--muted);font-size:0.85rem;">Kunne ikke hente de seneste.</p>';
    if (!rows.length) return `<p style="color:var(--muted);font-size:0.85rem;">Ingen annoncer fjernet de sidste ${DAYS} dage.</p>`;
    const raekker = rows.map(b => {
      const p = b.profiles || {};
      const navn = p.seller_type === 'dealer' ? (p.shop_name || p.name) : p.name;
      const solgt = !!b.sold_via;
      const dage = b.created_at
        ? Math.max(0, Math.round((new Date(b.deleted_at) - new Date(b.created_at)) / 86400000))
        : null;
      return `
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 10px 8px 0;font-size:0.84rem;">${esc([b.brand, b.model].filter(Boolean).join(' ') || 'Uden titel')}</td>
          <td style="padding:8px 10px;font-size:0.84rem;color:var(--muted);white-space:nowrap;">${esc(navn || 'Ukendt')}</td>
          <td style="padding:8px 10px;font-size:0.84rem;color:var(--muted);white-space:nowrap;">${dage !== null ? dage + ' dage' : '—'}</td>
          <td style="padding:8px 0 8px 10px;white-space:nowrap;">
            <span style="font-size:0.74rem;font-weight:600;padding:3px 9px;border-radius:999px;
                         background:${solgt ? 'rgba(42,61,46,0.10)' : 'rgba(200,80,42,0.10)'};
                         color:${solgt ? 'var(--forest)' : 'var(--rust)'};">
              ${solgt ? 'Solgt' : 'Fjernet'}
            </span>
          </td>
        </tr>`;
    }).join('');
    return `
      <h3 style="font-family:'Fraunces',serif;font-size:1.05rem;margin:0 0 10px;">Senest fjernet</h3>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:1.5px solid var(--border);">
            <th style="text-align:left;padding:0 10px 8px 0;font-size:0.76rem;color:var(--muted);font-weight:600;">Annonce</th>
            <th style="text-align:left;padding:0 10px 8px;font-size:0.76rem;color:var(--muted);font-weight:600;">Sælger</th>
            <th style="text-align:left;padding:0 10px 8px;font-size:0.76rem;color:var(--muted);font-weight:600;">Lå oppe</th>
            <th style="text-align:left;padding:0 0 8px 10px;font-size:0.76rem;color:var(--muted);font-weight:600;">Udfald</th>
          </tr></thead>
          <tbody>${raekker}</tbody>
        </table>
      </div>`;
  }

  return { loadListingOutcomes };
}
