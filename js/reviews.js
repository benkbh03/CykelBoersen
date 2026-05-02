export function createReviews({
  supabase,
  esc,
  showToast,
  enableFocusTrap,
  getCurrentUser,
  openUserProfile,
}) {
  let ratingModalUserId = null;
  let ratingModalUserName = null;

  function pickStar(val) {
    window._pickedStar = val;
    highlightStars(val);
  }

  function highlightStars(val) {
    document.querySelectorAll('.star-pick').forEach(s => {
      s.classList.toggle('active', +s.dataset.val <= val);
    });
  }

  async function submitReview(reviewedUserId) {
    const rating  = window._pickedStar || 0;
    const comment = document.getElementById('review-comment')?.value?.trim() || '';

    const currentUser = getCurrentUser();
    if (!currentUser) { showToast('⚠️ Log ind for at give en vurdering'); return; }
    if (rating < 1)   { showToast('⚠️ Vælg et antal stjerner'); return; }

    const { data: tradeMsg } = await supabase.from('messages')
      .select('id')
      .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${reviewedUserId}),and(sender_id.eq.${reviewedUserId},receiver_id.eq.${currentUser.id})`)
      .ilike('content', '%accepteret%')
      .limit(1);
    const hasTraded = tradeMsg?.length > 0;
    if (!hasTraded) { showToast('⚠️ Du kan kun vurdere brugere du har handlet med via Cykelbørsen'); return; }

    const { error } = await supabase.from('reviews').insert({
      reviewer_id:      currentUser.id,
      reviewed_user_id: reviewedUserId,
      rating,
      comment: comment || null,
    });

    if (error) { showToast('❌ Kunne ikke sende vurdering'); console.error(error); return; }

    showToast('✅ Vurdering sendt!');
    openUserProfile(reviewedUserId);
  }

  function openRateModal(otherId, otherName, _bikeInfo) {
    ratingModalUserId = otherId;
    ratingModalUserName = otherName;

    const content = `
      <div class="rate-modal-section">
        <div class="rate-modal-person">Vurder ${esc(otherName)}</div>
        <label class="rate-modal-label">Hvordan var din handel?</label>
        <div class="rate-stars" id="rate-stars">
          ${[1,2,3,4,5].map(i => `<span class="star-pick" data-val="${i}" onclick="pickStar(${i})">★</span>`).join('')}
        </div>
        <label class="rate-modal-label">Kommentar (valgfrit)</label>
        <textarea id="rate-modal-comment" class="rate-comment" placeholder="Fortæl om din handel..."></textarea>
      </div>
    `;

    document.getElementById('rate-modal-content').innerHTML = content;

    document.querySelectorAll('#rate-stars .star-pick').forEach(s => {
      s.addEventListener('mouseover', () => highlightStars(+s.dataset.val));
      s.addEventListener('mouseout',  () => highlightStars(window._pickedStar || 0));
    });

    window._pickedStar = 0;
    document.querySelectorAll('#rate-stars .star-pick').forEach(s => s.classList.remove('active'));

    const modal = document.getElementById('rate-now-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    enableFocusTrap('rate-now-modal');
  }

  function closeRateModal() {
    const modal = document.getElementById('rate-now-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    ratingModalUserId = null;
    ratingModalUserName = null;
    window._pickedStar = 0;
  }

  async function submitRatingFromModal() {
    if (!ratingModalUserId) return;

    const rating  = window._pickedStar || 0;
    const comment = document.getElementById('rate-modal-comment')?.value?.trim() || '';

    const currentUser = getCurrentUser();
    if (!currentUser) { showToast('⚠️ Log ind for at give en vurdering'); return; }
    if (rating < 1)   { showToast('⚠️ Vælg et antal stjerner'); return; }

    const { data: tradeMsg } = await supabase.from('messages')
      .select('id')
      .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${ratingModalUserId}),and(sender_id.eq.${ratingModalUserId},receiver_id.eq.${currentUser.id})`)
      .ilike('content', '%accepteret%')
      .limit(1);
    const hasTraded = tradeMsg?.length > 0;
    if (!hasTraded) { showToast('⚠️ Du kan kun vurdere brugere du har handlet med via Cykelbørsen'); return; }

    const { error } = await supabase.from('reviews').insert({
      reviewer_id:      currentUser.id,
      reviewed_user_id: ratingModalUserId,
      rating,
      comment: comment || null,
    });

    if (error) { showToast('❌ Kunne ikke sende vurdering'); console.error(error); return; }

    showToast('✅ Vurdering sendt!');
    closeRateModal();
  }

  return {
    pickStar,
    highlightStars,
    submitReview,
    openRateModal,
    closeRateModal,
    submitRatingFromModal,
  };
}
