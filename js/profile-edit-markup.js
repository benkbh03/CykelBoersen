/* ============================================================
   REDIGER PROFIL: markup til /me/rediger

   Flyttet fra profil-modalen i partials/modals.html. Id'erne er de samme,
   fordi profile-edit-page.js (showProfileData, saveProfile) og
   main.js (updateVerifyUI, openProfileCompletion) læser dem.
   Felterne fyldes af showProfileData(); her er kun skelettet.
   ============================================================ */

const svgBack = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const svgCamera = `<svg class="ui-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h3.5l1.6-2.4h7.8L17.5 7H21v13H3z"/><circle cx="12" cy="13" r="4"/></svg>`;

export function buildProfileEditHTML() {
  return `
  <div class="mp-wrap">
   <div class="mp-inner pe-inner">
    <div class="mp-top">
      <button class="mp-back-btn" onclick="navigateTo('/me')">${svgBack} Min konto</button>
      <h1 class="mp-title">Rediger profil</h1>
    </div>

    <!-- Profilbillede + navn. Hele avataren er klikbar; knappen ved siden af
         er der, fordi hover-overlayet ikke findes på en telefon. -->
    <div class="profile-header pe-header">
      <div class="profile-avatar-wrap" id="edit-avatar-wrap" onclick="document.getElementById('avatar-file-input').click()" title="Skift profilbillede">
        <div class="profile-big-avatar" id="profile-big-avatar">?</div>
        <div class="avatar-upload-overlay">${svgCamera}</div>
      </div>
      <input type="file" id="avatar-file-input" accept="image/*" style="display:none" onchange="uploadAvatar(this.files[0])">
      <div class="pe-header-text">
        <div class="profile-name" id="profile-display-name">Indlæser...</div>
        <div class="profile-email" id="profile-display-email"></div>
        <span class="badge badge-private" id="profile-type-badge"></span>
      </div>
      <button type="button" class="mp-action-secondary pe-avatar-btn" onclick="document.getElementById('avatar-file-input').click()">Skift billede</button>
    </div>

    <section class="pe-section" id="profile-info">
      <h2 class="pe-section-title">Oplysninger</h2>
      <div class="form-grid" style="grid-template-columns:1fr;">
        <div class="form-group"><label for="edit-name">Navn</label><input type="text" id="edit-name" placeholder="Dit navn" autocomplete="name"></div>
        <!-- Kun forhandlere. En butiks nummer er offentlig virksomhedsinfo;
             en privat sælgers mobilnummer hører ikke til på en annonce, og
             kontakten skal gå gennem beskedsystemet hvor den kan modereres.
             Skjules i profile-edit-page.js sammen med adressefeltet. -->
        <div class="form-group" id="edit-phone-group" style="display:none;"><label for="edit-phone">Telefon</label><input type="tel" inputmode="tel" id="edit-phone" placeholder="f.eks. 12 34 56 78" maxlength="20" autocomplete="tel" data-1p-ignore="true" data-lpignore="true" data-form-type="other" data-bwignore="true"></div>
        <div class="form-group"><label for="edit-city">By</label><input type="text" id="edit-city" placeholder="f.eks. København"></div>
        <div class="form-group">
          <label for="edit-bio">Om mig</label>
          <textarea id="edit-bio" placeholder="Fortæl lidt om dig selv og din passion for cykler..." rows="4"></textarea>
        </div>
        <div class="form-group" id="edit-seller-type-group">
          <label>Sælgertype</label>
          <p class="pe-static-value" id="edit-seller-type-display"></p>
          <select id="edit-seller-type" style="display:none;">
            <option value="private">Privatperson</option>
            <option value="dealer">Forhandler</option>
          </select>
        </div>
        <div class="form-group" id="edit-shop-group" style="display:none;">
          <label for="edit-shop-name">Butiksnavn</label>
          <input type="text" id="edit-shop-name" placeholder="f.eks. VeloShop ApS">
        </div>
        <div class="form-group" id="edit-address-group" style="display:none;">
          <label for="edit-address">Adresse</label>
          <input type="text" id="edit-address" placeholder="f.eks. Vesterbrogade 42">
        </div>
        <div class="form-group" id="edit-dealer-offers-group" style="display:none;">
          <label>Hvad tilbyder din butik?</label>
          <div class="dealer-offers-checks">
            <label class="dealer-offer-check">
              <input type="checkbox" id="edit-offers-financing">
              <span>Finansiering</span>
            </label>
            <label class="dealer-offer-check">
              <input type="checkbox" id="edit-offers-tradein">
              <span>Byttetilbud</span>
            </label>
          </div>
          <label class="optout-check" data-optout-for="offers">
            <input type="checkbox" id="edit-offers-optout">
            <span>Vi tilbyder hverken finansiering eller byttetilbud</span>
          </label>
          <p class="dealer-offers-hint">Vises på dine annoncer under "Køb hos forhandler".</p>
        </div>
        <div class="form-group" id="edit-services-group" style="display:none;">
          <label>Services</label>
          <div id="edit-services-mount"></div>
          <p class="dealer-offers-hint">Vises som badges på din forhandlerprofil og kan filtreres på /forhandlere.</p>
        </div>
        <div class="form-group" id="edit-opening-hours-group" style="display:none;">
          <label>Åbningstider</label>
          <div id="edit-opening-hours-mount"></div>
          <p class="dealer-offers-hint">Vises på din profil, så kunder kan se om du har åbent lige nu.</p>
        </div>
        <div class="form-group" id="edit-website-group" style="display:none;">
          <label for="edit-website">Website</label>
          <input type="url" id="edit-website" placeholder="https://dinbutik.dk">
        </div>
        <div class="form-group" id="edit-facebook-group" style="display:none;">
          <label for="edit-facebook">Facebook</label>
          <input type="url" id="edit-facebook" placeholder="https://facebook.com/dinbutik">
        </div>
        <div class="form-group" id="edit-instagram-group" style="display:none;">
          <label for="edit-instagram">Instagram</label>
          <input type="url" id="edit-instagram" placeholder="https://instagram.com/dinbutik">
        </div>
        <div class="form-group" id="edit-social-optout-group" style="display:none;">
          <label class="optout-check" data-optout-for="social">
            <input type="checkbox" id="edit-social-optout">
            <span>Vi har ikke website eller social media-profiler</span>
          </label>
        </div>
      </div>
      <button id="save-profile-btn" class="form-submit" onclick="saveProfile()">Gem ændringer</button>
    </section>

    <section class="pe-section">
      <!-- Cykelbørsen onboarding-service (admin opretter annoncer på forhandlers vegne) -->
      <div class="onboarding-service-box" id="admin-onboarding-box" style="display:none;">
        <div class="onboarding-service-title">Cykelbørsen onboarding-service</div>
        <p class="onboarding-service-desc">Lad Cykelbørsen oprette og løbende vedligeholde dine cykel-annoncer på dine vegne — import fra dit webshop-feed, automatisk pris- og lager-synkronisering, og rettelser af annonce-detaljer. Vi har KUN adgang til dine annoncer (oprette, redigere, deaktivere) — ikke dine beskeder, indstillinger eller andet på din profil.</p>
        <a href="/databehandleraftale/" onclick="event.preventDefault();navigateTo('/databehandleraftale')" class="onboarding-service-dpa-link">Læs databehandleraftalen</a>

        <!-- Vises når IKKE opt-in (eller når vilkårene er opdateret og kræver gen-accept) -->
        <div id="admin-onboarding-grant">
          <div id="admin-onboarding-reaccept-notice" style="display:none;background:#fff7e6;border:1px solid #e0a800;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:0.82rem;color:#7a5a00;line-height:1.5;">
            <strong>Vilkårene er opdateret.</strong> Onboarding-servicen dækker nu også <strong>løbende vedligehold og rettelser</strong> af dine annoncer (ud over oprettelse). Bekræft venligst de opdaterede vilkår for at fortsætte.
          </div>
          <label class="onboarding-service-consent">
            <input type="checkbox" id="admin-onboarding-consent-cb">
            <span>Jeg har læst databehandleraftalen og giver tilladelse</span>
          </label>
          <button class="onboarding-service-btn-grant" id="admin-onboarding-grant-btn" onclick="grantAdminOnboarding()" disabled>Aktivér onboarding-service</button>
        </div>

        <!-- Vises når opt-in -->
        <div id="admin-onboarding-active" style="display:none;">
          <div class="onboarding-service-status">
            <span class="onboarding-service-status-icon">✓</span>
            <div>
              <div class="onboarding-service-status-title">Aktiveret</div>
              <div class="onboarding-service-status-sub" id="admin-onboarding-activated-at"></div>
            </div>
          </div>
          <div class="onboarding-service-audit" id="admin-onboarding-audit"></div>
          <button class="onboarding-service-btn-revoke" onclick="revokeAdminOnboarding()">Tilbagekald tilladelse</button>
        </div>
      </div>

      <!-- Forhandlerabonnement -->
      <div class="subscription-box" id="subscription-box" style="display:none;">
        <div class="subscription-header">
          <div>
            <div class="subscription-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;" aria-hidden="true"><path d="M3 9l1.5-5h15L21 9"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></svg> Forhandlerabonnement</div>
            <div class="subscription-sub">Administrer dit aktive abonnement</div>
          </div>
          <span id="subscription-status-badge" class="sub-status-active">Aktivt</span>
        </div>
        <button class="btn-manage-subscription" id="btn-manage-subscription" onclick="openSubscriptionPortal()">
          Administrer abonnement
        </button>
      </div>

      <!-- Verificering: E-mail -->
      <div class="verify-box" id="verify-box">
        <div class="verify-box-title">Verificering</div>
        <div class="verify-box-sub">Verificerede brugere skaber tillid og handler hurtigere</div>

        <div class="verify-row" id="verify-email-row">
          <div class="verify-row-icon"><svg class="ui-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg></div>
          <div class="verify-row-body">
            <div class="verify-row-label">E-mail</div>
            <div class="verify-row-value" id="verify-email-value">–</div>
          </div>
          <span class="verify-row-status" id="verify-email-status"></span>
        </div>
      </div>
    </section>

    <section class="pe-section">
      <h2 class="pe-section-title">Slet konto</h2>
      <p class="pe-section-sub">Sletter din profil, dine annoncer, beskeder og billeder. Det kan ikke fortrydes.</p>
      <button class="btn-delete-account" id="delete-account-btn" onclick="deleteAccount()">Slet konto permanent</button>
    </section>
   </div>
  </div>`;
}
