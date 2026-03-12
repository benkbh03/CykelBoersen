/* ============================================================
   CYKELBØRSEN – main.js (med Supabase)
   ============================================================ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://ktufgncydxhkhfttojkh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bxJ_gRDrsJ-XCWWUD6NiQA_1nlPDA2B';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── HENT OG VIS ANNONCER ───────────────────────────────────*/
async function loadBikes(filters = {}) {
  const grid = document.getElementById('listings-grid');
  grid.innerHTML = '<p style="color:var(--muted);padding:20px">Henter annoncer...</p>';

  let query = supabase
    .from('bikes')
    .select(`*, profiles (name, seller_type, shop_name), bike_images (url, is_primary)`)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (filters.type)       query = query.eq('type', filters.type);
  if (filters.sellerType) query = query.eq('profiles.seller_type', filters.sellerType);
  if (filters.maxPrice)   query = query.lte('price', filters.maxPrice);

  const { data, error } = await query;

  if (error) {
    grid.innerHTML = '<p style="color:var(--rust);padding:20px">Kunne ikke hente annoncer. Prøv igen.</p>';
    console.error(error);
    return;
  }

  renderBikes(data);
}

/* ── RENDER ANNONCEKORT ─────────────────────────────────────*/
function renderBikes(bikes) {
  const grid = document.getElementById('listings-grid');

  if (!bikes || bikes.length === 0) {
    grid.innerHTML = '<p style="color:var(--muted);padding:20px">Ingen annoncer fundet.</p>';
    return;
  }

  grid.innerHTML = bikes.map((b, i) => {
    const profile    = b.profiles || {};
    const sellerType = profile.seller_type || 'private';
    const sellerName = sellerType === 'dealer' ? profile.shop_name : profile.name;
    const initials   = (sellerName || 'U').substring(0, 2).toUpperCase();
    const primaryImg = b.bike_images?.find(img => img.is_primary)?.url;
    const imgContent = primaryImg
      ? `<img src="${primaryImg}" alt="${b.brand} ${b.model}" style="width:100%;height:100%;object-fit:cover;">`
      : '<span style="font-size:4rem">🚲</span>';

    return `
      <div class="bike-card" style="animation-delay: ${i * 50}ms" data-id="${b.id}">
        <div class="bike-card-img">
          ${imgContent}
          <span class="condition-tag">${b.condition}</span>
          <button class="save-btn" aria-label="Gem annonce"
            onclick="event.stopPropagation(); toggleSave(this, '${b.id}')">🤍</button>
        </div>
        <div class="bike-card-body">
          <div class="card-top">
            <div class="bike-title">${b.brand} ${b.model}</div>
            <div class="bike-price">${b.price.toLocaleString('da-DK')} kr.</div>
          </div>
          <div class="bike-meta">
            <span>${b.type}</span>
            <span>${b.year || '–'}</span>
            <span>Str. ${b.size || '–'}</span>
          </div>
          <div class="card-footer">
            <div class="seller-info">
              <div class="seller-avatar">${initials}</div>
              <div>
                <div class="seller-name">${sellerName || 'Ukendt'}</div>
                <span class="badge ${sellerType === 'dealer' ? 'badge-dealer' : 'badge-private'}">
                  ${sellerType === 'dealer' ? '🏪 Forhandler' : '👤 Privat'}
                </span>
              </div>
            </div>
            <div class="card-location">📍 ${b.city}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/* ── GEM / FJERN ANNONCE ────────────────────────────────────*/
async function toggleSave(btn, bikeId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    showToast('⚠️ Log ind for at gemme annoncer');
    return;
  }
  const isSaved = btn.textContent === '❤️';
  if (isSaved) {
    await supabase.from('saved_bikes').delete()
      .eq('user_id', user.id).eq('bike_id', bikeId);
    btn.textContent = '🤍';
  } else {
    await supabase.from('saved_bikes').insert({ user_id: user.id, bike_id: bikeId });
    btn.textContent = '❤️';
  }
}

/* ── HURTIGFILTER PILLS ─────────────────────────────────────*/
function togglePill(el) {
  document.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
  el.classList.add('active');
  const text = el.textContent.trim();
  if      (text === 'Alle')            loadBikes();
  else if (text === 'El-cykler')       loadBikes({ type: 'El-cykel' });
  else if (text === 'Kun forhandlere') loadBikes({ sellerType: 'dealer' });
  else if (text === 'Kun private')     loadBikes({ sellerType: 'private' });
  else if (text === 'Under 3.000 kr') loadBikes({ maxPrice: 3000 });
}

/* ── OPRET ANNONCE MODAL ────────────────────────────────────*/
async function openModal() {
  // Tjek om bruger er logget ind — hvis ikke, vis login i stedet
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    openLoginModal();
    showToast('⚠️ Log ind for at oprette en annonce');
    return;
  }
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

/* ── LOGIN MODAL ────────────────────────────────────────────*/
function openLoginModal() {
  document.getElementById('login-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLoginModal() {
  document.getElementById('login-modal').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('login-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeLoginModal();
});

/* Skift mellem "Log ind" og "Opret konto" faner */
function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tab-login').classList.toggle('selected', isLogin);
  document.getElementById('tab-register').classList.toggle('selected', !isLogin);
  document.getElementById('form-login').style.display    = isLogin ? 'block' : 'none';
  document.getElementById('form-register').style.display = isLogin ? 'none'  : 'block';
}

/* ── HÅNDTER LOGIN ──────────────────────────────────────────*/
async function handleLogin() {
  const email    = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    showToast('⚠️ Udfyld email og adgangskode');
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showToast('❌ Forkert email eller adgangskode');
  } else {
    closeLoginModal();
    showToast('✅ Du er nu logget ind');
  }
}

/* ── HÅNDTER REGISTRERING ───────────────────────────────────*/
async function handleRegister() {
  const name     = document.getElementById('register-name').value;
  const email    = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;

  if (!name || !email || !password) {
    showToast('⚠️ Udfyld alle felter');
    return;
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    showToast('❌ ' + error.message);
  } else {
    closeLoginModal();
    showToast('✅ Tjek din email for at bekræfte kontoen');
  }
}

/* ── SÆLGER-TYPE TOGGLE ─────────────────────────────────────*/
function selectType(type) {
  const isDealer = type === 'dealer';
  document.getElementById('type-private').classList.toggle('selected', !isDealer);
  document.getElementById('type-dealer').classList.toggle('selected', isDealer);
  document.getElementById('dealer-fields').style.display = isDealer ? 'block' : 'none';
}

/* ── INDSEND ANNONCE ────────────────────────────────────────*/
async function submitListing() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    showToast('⚠️ Log ind for at oprette en annonce');
    return;
  }

  const bikeData = {
    user_id:     user.id,
    brand:       document.querySelector('[placeholder="f.eks. Trek, Giant, Specialized"]').value,
    model:       document.querySelector('[placeholder="f.eks. FX 3 Disc"]').value,
    price:       parseInt(document.querySelector('[placeholder="f.eks. 4500"]').value),
    year:        parseInt(document.querySelector('[placeholder="f.eks. 2021"]').value) || null,
    city:        document.querySelector('[placeholder="f.eks. København"]').value,
    description: document.querySelector('textarea').value,
    type:        document.querySelectorAll('.form-grid select')[0].value,
    size:        document.querySelectorAll('.form-grid select')[1].value,
    condition:   document.querySelectorAll('.form-grid select')[2].value,
    title:       `${document.querySelector('[placeholder="f.eks. Trek, Giant, Specialized"]').value} ${document.querySelector('[placeholder="f.eks. FX 3 Disc"]').value}`,
  };

  if (!bikeData.brand || !bikeData.model || !bikeData.price || !bikeData.city) {
    showToast('⚠️ Udfyld venligst alle påkrævede felter (*)');
    return;
  }

  const { error } = await supabase.from('bikes').insert(bikeData);
  if (error) {
    showToast('❌ Noget gik galt – prøv igen');
    console.error(error);
    return;
  }

  closeModal();
  showToast('✅ Din annonce er oprettet!');
  loadBikes();
}

/* ── LOGOUT ─────────────────────────────────────────────────*/
async function logout() {
  await supabase.auth.signOut();
  showToast('👋 Du er logget ud');
}

/* ── OPDATER NAV VED LOGIN/LOGOUT ───────────────────────────*/
supabase.auth.onAuthStateChange((_event, session) => {
  const sellBtn = document.querySelector('.btn-sell');
  if (!sellBtn) return;
  if (session) {
    sellBtn.textContent = '+ Sæt til salg';
    sellBtn.setAttribute('onclick', 'openModal()');
  } else {
    sellBtn.textContent = 'Log ind / Sælg';
    sellBtn.setAttribute('onclick', 'openLoginModal()');
  }
});

/* ── TOAST-BESKED ───────────────────────────────────────────*/
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

/* ── NAVIGATION SCROLL ──────────────────────────────────────*/
function showSection(section) {
  if (section === 'dealers') {
    document.querySelector('.dealer-strip').scrollIntoView({ behavior: 'smooth' });
  } else {
    document.querySelector('.main').scrollIntoView({ behavior: 'smooth' });
  }
}

/* ── GØR FUNKTIONER GLOBALE ─────────────────────────────────*/
window.openModal      = openModal;
window.closeModal     = closeModal;
window.openLoginModal = openLoginModal;
window.closeLoginModal= closeLoginModal;
window.switchTab      = switchTab;
window.handleLogin    = handleLogin;
window.handleRegister = handleRegister;
window.selectType     = selectType;
window.togglePill     = togglePill;
window.toggleSave     = toggleSave;
window.submitListing  = submitListing;
window.showSection    = showSection;
window.logout         = logout;

/* ── INIT ───────────────────────────────────────────────────*/
loadBikes();
