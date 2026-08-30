/* ────────────────────────────────────────────────────────────────
   error-log.js — fang fejl i brugerens browser, og vis dem i admin

   Før dette blev en fejl kun opdaget hvis nogen skrev til dig om den, og det
   gør folk ikke. De forlader siden. main.js fangede allerede uhåndterede
   promise-fejl, men skrev dem kun til konsollen, som ingen andre end
   udvikleren ser.

   Modulet gør to ting, og de hører sammen fordi de handler om det samme:
   initErrorLog() opsamler, loadErrorLog() viser.

   ANONYMT, som search_logs og sell_funnel_events. Intet user_id, ingen IP,
   ingen e-mail. user_agent er med, fordi det næsten altid ER browseren der
   er forskellen på om fejlen sker.

   Tre ting holder tabellen fra at løbe løbsk, og de er vigtigere end de ser
   ud: en fejl i en scroll- eller resize-handler kan fyre hundredvis af gange
   i sekundet, og uden bremser ville den alene kunne fylde databasen.
──────────────────────────────────────────────────────────────── */

const MAX_PR_SESSION = 8;      // hårdt loft pr. sidevisning
const MAX_STACK      = 900;    // tegn; resten er sjældent nyttigt
const MAX_MESSAGE    = 300;

export function initErrorLog({ supabase }) {
  if (!supabase) return;

  const sendte = new Set();    // samme fejl kun én gang pr. sidevisning
  let antal = 0;

  async function rapporter(kind, message, source, stack) {
    if (antal >= MAX_PR_SESSION) return;

    const besked = String(message || 'Ukendt fejl').slice(0, MAX_MESSAGE);

    /* Støj vi ikke kan gøre noget ved, og som ellers ville drukne det
       rigtige: browser-udvidelser der sprøjter fejl ind på alle sider, og
       "Script error." som er browserens indholdsløse besked når fejlen kom
       fra et andet domæne (typisk et CDN) og detaljerne er skjult. */
    if (/^Script error\.?$/i.test(besked)) return;
    if (/extension:\/\/|chrome-extension|moz-extension|safari-web-extension/i.test(String(source || '') + stack)) return;

    const noegle = besked + '|' + (source || '');
    if (sendte.has(noegle)) return;
    sendte.add(noegle);
    antal++;

    try {
      await supabase.from('client_errors').insert({
        message: besked,
        source: String(source || '').slice(0, 300) || null,
        // Kun stien, aldrig query-strengen: den kan indeholde en søgning
        // eller et annonce-id og hører ikke hjemme i en fejllog.
        path: location.pathname,
        stack: stack ? String(stack).slice(0, MAX_STACK) : null,
        user_agent: navigator.userAgent.slice(0, 300),
        kind,
      });
    } catch (_) {
      // En fejl i fejlloggeren må aldrig blive til en ny fejl.
    }
  }

  window.addEventListener('error', (e) => {
    // Fejl på et <img> eller <script> bobler op som samme hændelse, men har
    // ingen message. Dem springer vi over; de siger kun at en fil manglede.
    if (!e || !e.message) return;
    rapporter('error', e.message, `${e.filename || ''}:${e.lineno || 0}`, e.error?.stack);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason;
    rapporter('promise', r?.message || String(r), null, r?.stack);
  });
}

/* ── ADMIN-VISNING ───────────────────────────────────────────── */

export function createErrorLog({ supabase, esc, retryHTML }) {
  const DAGE = 14;

  async function loadErrorLog() {
    const el = document.getElementById('admin-errors');
    if (!el) return;
    el.innerHTML = '<p style="color:var(--muted)">Indlæser…</p>';

    try {
      const since = new Date(Date.now() - DAGE * 86400000).toISOString();
      const { data, error } = await supabase
        .from('client_errors')
        .select('message, source, path, user_agent, kind, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;

      const rows = data || [];
      if (!rows.length) {
        el.innerHTML = `
          <div style="padding:22px;background:var(--sand);border-radius:12px;">
            <div style="font-family:'Fraunces',serif;font-size:1.4rem;">Ingen fejl</div>
            <p style="margin:6px 0 0;color:var(--muted);font-size:0.86rem;">
              Der er ikke logget nogen JavaScript-fejl de sidste ${DAGE} dage.</p>
          </div>`;
        return;
      }

      /* Grupperet på besked, ikke listet enkeltvis. Den samme fejl rammer
         typisk mange brugere, og det er antallet der afgør hvad du skal
         rette først — ikke rækkefølgen de kom i. */
      const grupper = new Map();
      for (const r of rows) {
        const n = r.message;
        const g = grupper.get(n) || { message: n, antal: 0, senest: r.created_at, source: r.source, stier: new Set(), browsere: new Set() };
        g.antal++;
        if (r.created_at > g.senest) g.senest = r.created_at;
        if (r.path) g.stier.add(r.path);
        g.browsere.add(kortBrowser(r.user_agent));
        grupper.set(n, g);
      }
      const sorteret = [...grupper.values()].sort((a, b) => b.antal - a.antal).slice(0, 40);

      el.innerHTML = `
        <div style="padding:16px 18px;background:var(--sand);border-radius:12px;margin-bottom:18px;">
          <span style="font-family:'Fraunces',serif;font-size:1.6rem;font-weight:700;">${rows.length}</span>
          <span style="font-size:0.88rem;color:var(--charcoal);"> fejl fordelt på ${grupper.size} forskellige, sidste ${DAGE} dage</span>
        </div>
        ${sorteret.map(kortHtml).join('')}`;
    } catch (err) {
      console.error(err);
      const mangler = /client_errors/.test(err?.message || '');
      el.innerHTML = mangler
        ? '<p style="color:var(--rust);line-height:1.6;">Tabellen <code>client_errors</code> findes ikke endnu.<br>'
          + 'Kør <code>supabase/sql/add_client_errors.sql</code> i SQL Editor først.</p>'
        : retryHTML('Kunne ikke hente fejl.', 'loadErrorLog');
    }
  }

  /** Fuld user agent er ulæselig. Vi skal kun bruge hvilken browser. */
  function kortBrowser(ua = '') {
    if (/edg\//i.test(ua))                      return 'Edge';
    if (/chrome|crios/i.test(ua))               return 'Chrome';
    if (/firefox|fxios/i.test(ua))              return 'Firefox';
    if (/safari/i.test(ua))                     return 'Safari';
    return 'Andet';
  }

  function kortHtml(g) {
    const dato = new Date(g.senest).toLocaleString('da-DK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const stier = [...g.stier].slice(0, 3).join(', ') + (g.stier.size > 3 ? ` +${g.stier.size - 3}` : '');
    return `
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <span style="flex-shrink:0;background:var(--rust);color:#fff;font-size:0.74rem;font-weight:700;padding:2px 9px;border-radius:999px;">${g.antal}×</span>
          <code style="font-size:0.82rem;line-height:1.45;word-break:break-word;color:var(--charcoal);">${esc(g.message)}</code>
        </div>
        <div style="font-size:0.74rem;color:var(--muted);margin-top:8px;line-height:1.6;">
          ${g.source ? esc(g.source) + ' · ' : ''}${esc(stier) || 'ukendt side'}<br>
          ${esc([...g.browsere].join(', '))} · senest ${esc(dato)}
        </div>
      </div>`;
  }

  return { loadErrorLog };
}
