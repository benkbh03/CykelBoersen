export function createQuickReplies({ esc, getCurrentProfile }) {
  function useQuickReply(textareaId, btn) {
    const ta = document.getElementById(textareaId);
    if (!ta) return;
    ta.value = btn.textContent.replace(/\s*👍$/, ' 👍').trim();
    ta.focus();
  }

  function getQuickReplies() {
    const isDealer = getCurrentProfile()?.seller_type === 'dealer';
    if (isDealer) {
      return [
        'Tak for din interesse — cyklen er stadig til salg.',
        'Du er velkommen til at komme forbi og prøve den.',
        'Vi har åbent man-fre 10-17, lør 10-14.',
        'Vi tilbyder finansiering og byttetilbud.',
        'Tak for handlen — god tur!',
      ];
    }
    return [
      'Stadig til salg 👍',
      'Prisen er fast',
      'Kan mødes i weekenden',
      'Er du stadig interesseret?',
      'Tak for interessen!',
    ];
  }

  function renderQuickRepliesHTML(textareaId) {
    return getQuickReplies().map(reply =>
      `<button class="qr-btn" onclick="useQuickReply('${textareaId}', this)">${esc(reply)}</button>`
    ).join('');
  }

  return { useQuickReply, getQuickReplies, renderQuickRepliesHTML };
}
