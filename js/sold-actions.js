export function createSoldActions({ supabase, getCurrentUser, showToast, reloadMyListings, loadBikes, updateFilterCounts, openUserProfileWithReview }) {
  async function markBikeSold(bikeId, buyerId, buyerName) {
    const currentUser = getCurrentUser();
    const err = (await supabase.from('bikes').update({ is_active: false }).eq('id', bikeId)).error;
    if (err) { showToast('❌ Kunne ikke markere som solgt'); return; }

    if (buyerId) {
      await supabase.from('messages').insert({
        bike_id: bikeId,
        sender_id: currentUser.id,
        receiver_id: buyerId,
        content: '✅ Handel bekræftet og accepteret! Tak for handlen – I kan nu vurdere hinanden.',
      });
      reloadMyListings(); loadBikes(); updateFilterCounts();
      openUserProfileWithReview(buyerId);
    } else {
      showToast('🏷️ Annonce markeret som solgt');
      reloadMyListings(); loadBikes(); updateFilterCounts();
    }
  }

  async function confirmBuyerSelection(bikeId, buyerId, buyerName) {
    const modal = document.getElementById('buyer-picker-modal');
    if (modal) modal.remove();
    document.body.style.overflow = '';
    await markBikeSold(bikeId, buyerId, buyerName);
  }

  function showBuyerPickerModal(bikeId, buyers) {
    const existing = document.getElementById('buyer-picker-modal');
    if (existing) existing.remove();

    const options = buyers.map(m => {
      const name = m.sender?.seller_type === 'dealer' ? (m.sender?.shop_name || m.sender?.name) : m.sender?.name;
      const safe = (name || 'Ukendt').replace(/'/g, "\\'");
      return `<button class="buyer-pick-btn" onclick="confirmBuyerSelection('${bikeId}','${m.sender_id}','${safe}')">
        <span style="font-weight:600;">${name || 'Ukendt'}</span>
      </button>`;
    }).join('');

    const el = document.createElement('div');
    el.id = 'buyer-picker-modal';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;';
    el.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:24px;max-width:360px;width:100%;font-family:'DM Sans',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.18);">
        <h3 style="font-family:'Fraunces',serif;margin:0 0 6px;">Hvem købte cyklen?</h3>
        <p style="color:var(--muted);font-size:0.88rem;margin:0 0 16px;">Vælg køber, så I begge kan vurdere hinanden.</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${options}
          <button class="buyer-pick-btn" style="color:var(--muted);border-color:var(--border);" onclick="confirmBuyerSelection('${bikeId}',null,null)">
            Ingen af disse / ekstern handel
          </button>
        </div>
      </div>`;
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
  }

  async function toggleSold(bikeId, currentlySold) {
    const currentUser = getCurrentUser();
    if (currentlySold) {
      const err = (await supabase.from('bikes').update({ is_active: true }).eq('id', bikeId)).error;
      if (err) { showToast('❌ Kunne ikke opdatere status'); return; }
      showToast('✅ Annonce aktiv igen');
      reloadMyListings(); loadBikes(); updateFilterCounts();
      return;
    }

    // Anti-gaming: 24-timers cooldown på "Sæt solgt" — forhindrer den hurtige
    // "post + markér solgt"-loop hvor sælgere prøver at boost'e deres trust-
    // score uden faktisk at have en handel. Legitime salg sker sjældent under
    // 24 timer (køber skal kontakte, aftale møde, mødes, betale, anmelde).
    const { data: bikeInfo, error: bikeErr } = await supabase
      .from('bikes')
      .select('created_at')
      .eq('id', bikeId)
      .single();
    if (bikeErr || !bikeInfo) { showToast('❌ Kunne ikke hente annoncedata'); return; }
    const ageMs = Date.now() - new Date(bikeInfo.created_at).getTime();
    const cooldownMs = 24 * 60 * 60 * 1000;
    if (ageMs < cooldownMs) {
      const hoursLeft = Math.ceil((cooldownMs - ageMs) / (60 * 60 * 1000));
      showToast(`⏱️ Annoncen skal være aktiv i 24 timer før den kan markeres som solgt (${hoursLeft} ${hoursLeft === 1 ? 'time' : 'timer'} tilbage)`);
      return;
    }

    const { data: threads } = await supabase.from('messages')
      .select('sender_id, sender:profiles!messages_sender_id_fkey(name, shop_name, seller_type)')
      .eq('bike_id', bikeId)
      .eq('receiver_id', currentUser.id)
      .neq('sender_id', currentUser.id);

    const seen = new Set();
    const buyers = (threads || []).filter(m => {
      if (seen.has(m.sender_id)) return false;
      seen.add(m.sender_id);
      return true;
    });

    if (buyers.length > 0) showBuyerPickerModal(bikeId, buyers);
    else await markBikeSold(bikeId, null, null);
  }

  return { toggleSold, showBuyerPickerModal, confirmBuyerSelection, markBikeSold };
}
