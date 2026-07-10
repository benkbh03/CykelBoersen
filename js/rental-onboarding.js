/* ============================================================
   UDLEJER-ONBOARDING (/bliv-udlejer)
   ------------------------------------------------------------
   Forhandler-CTA til at komme i gang med cykeludlejning. Starter
   Stripe Connect onboarding (edge function 'connect-onboarding'),
   hvor Stripe håndterer KYC + bankkonto. Gater resten af
   udlejnings-flowet bag stripe_account_status='enabled'.
   ============================================================ */

export function createRentalOnboarding({
  supabase,
  esc,
  getCurrentUser,
  showDetailView,
  navigateTo,
  updateSEOMeta,
  showToast,
  openLoginModal,
  BASE_URL,
}) {

  async function renderBecomeRenterPage() {
    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });

    const title = 'Udlej dine cykler – bliv udlejer | Cykelbørsen';
    document.title = title;
    updateSEOMeta(
      'Tilbyd cykeludlejning gennem CykelBørsen. Du sætter priser og tilgængelighed — vi håndterer booking og betaling, og du får pengene direkte. For registrerede forhandlere.',
      '/bliv-udlejer',
      { title }
    );

    const dv = document.getElementById('detail-view');
    if (!dv) return;

    const user = getCurrentUser();
    if (!user) {
      dv.innerHTML = shell(`
        <h1 class="rental-onb-title">Udlej dine cykler gennem CykelBørsen</h1>
        <p class="rental-onb-lead">Log ind som forhandler for at komme i gang med udlejning.</p>
        <button class="rental-onb-btn" onclick="openLoginModal()">Log ind</button>
      `);
      return;
    }

    dv.innerHTML = shell('<p class="rental-onb-lead">Henter din konto…</p>');

    const { data: p, error } = await supabase
      .from('profiles')
      .select('seller_type, stripe_account_status, shop_name')
      .eq('id', user.id)
      .single();

    if (error || !p) {
      dv.innerHTML = shell('<p class="rental-onb-lead">Kunne ikke hente din profil. Prøv igen.</p>');
      return;
    }

    if (p.seller_type !== 'dealer') {
      dv.innerHTML = shell(`
        <h1 class="rental-onb-title">Udlejning er for forhandlere</h1>
        <p class="rental-onb-lead">For at tilbyde cykeludlejning skal du være registreret som forhandler på CykelBørsen. Det er gratis lige nu.</p>
        <button class="rental-onb-btn" onclick="navigateTo('/bliv-forhandler')">Bliv forhandler</button>
      `);
      return;
    }

    const status = p.stripe_account_status || 'none';
    dv.innerHTML = shell(dealerBody(status, p.shop_name));
  }

  function dealerBody(status, shopName) {
    if (status === 'enabled') {
      return `
        <div class="rental-onb-badge rental-onb-badge--ok">✓ Udlejnings-konto aktiv</div>
        <h1 class="rental-onb-title">Du er klar til at udleje${shopName ? `, ${esc(shopName)}` : ''}!</h1>
        <p class="rental-onb-lead">Din Stripe-konto er sat op og klar til at modtage betalinger. Opret nu dine udlejningscykler med priser og tilgængelighed.</p>
        <button class="rental-onb-btn" onclick="navigateTo('/udlejning/opret')">Opret udlejningscykel</button>
        <p class="rental-onb-fineprint">Se og administrer dine udlejningscykler under <a href="/udlejning/mine" onclick="event.preventDefault();navigateTo('/udlejning/mine')">Mine udlejningscykler</a>.</p>
      `;
    }

    const started = status === 'pending';
    return `
      <h1 class="rental-onb-title">Tjen penge på at udleje dine cykler</h1>
      <p class="rental-onb-lead">Du sætter priser og tilgængelighed. Kunder booker og betaler her på sitet, og du får pengene udbetalt direkte til din konto. CykelBørsen tager en lille kommission per booking.</p>
      <ul class="rental-onb-list">
        <li>💳 Sikker betaling og depositum håndteres automatisk</li>
        <li>📅 Du styrer selv kalender og tilgængelighed</li>
        <li>🚲 Nå kunder der allerede leder efter cykler</li>
      </ul>
      <button class="rental-onb-btn" id="connect-onboard-btn" onclick="startConnectOnboarding()">
        ${started ? 'Fortsæt opsætning' : 'Kom i gang med udlejning'}
      </button>
      <p class="rental-onb-fineprint">Opsætningen sker sikkert hos Stripe, som håndterer verifikation og udbetalinger. Du accepterer <a href="/udlejningsvilkaar" onclick="event.preventDefault();navigateTo('/udlejningsvilkaar')">udlejningsvilkårene</a> undervejs.</p>
    `;
  }

  function shell(inner) {
    return `
      <div class="rental-onboarding">
        <button class="sell-back-btn" onclick="history.length > 1 ? history.back() : navigateTo('/')">← Tilbage</button>
        <div class="rental-onb-card">${inner}</div>
      </div>`;
  }

  async function startConnectOnboarding() {
    const btn = document.getElementById('connect-onboard-btn');
    const orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Sender dig videre…'; }
    try {
      const { data, error } = await supabase.functions.invoke('connect-onboarding', {
        body: { return_url: `${BASE_URL}/bliv-udlejer` },
      });
      if (error) {
        let msg = 'Kunne ikke starte opsætningen. Prøv igen.';
        try { msg = (await error.context.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      if (!data || !data.url) throw new Error('Kunne ikke starte opsætningen. Prøv igen.');
      window.location.href = data.url;
    } catch (e) {
      if (showToast) showToast((e && e.message) || 'Kunne ikke starte opsætningen. Prøv igen.');
      if (btn) { btn.disabled = false; btn.textContent = orig || 'Kom i gang med udlejning'; }
    }
  }

  return { renderBecomeRenterPage, startConnectOnboarding };
}
