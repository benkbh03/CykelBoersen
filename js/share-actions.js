export function createShareActions({ showToast }) {
  let currentShareBikeId = null;

  function openShareModal(bikeId, title) {
    currentShareBikeId = bikeId;
    var url  = 'https://cykelbørsen.dk/bike/' + bikeId;
    var text = 'Tjek denne cykel på Cykelbørsen: ' + title;

    document.getElementById('share-link-input').value = url;
    document.getElementById('share-modal').dataset.title = title;
    document.getElementById('share-whatsapp-btn').href  = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url);
    document.getElementById('share-facebook-btn').href  = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);

    document.getElementById('share-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeShareModal() {
    document.getElementById('share-modal').classList.remove('open');
    document.body.style.overflow = '';
  }

  function copyShareLink() {
    var input = document.getElementById('share-link-input');
    navigator.clipboard.writeText(input.value).then(function() {
      showToast('✅ Link kopieret!');
    }).catch(function() {
      input.select();
      document.execCommand('copy');
      showToast('✅ Link kopieret!');
    });
  }

  function shareViaSMS() {
    var url  = document.getElementById('share-link-input').value;
    var text = 'Tjek denne cykel på Cykelbørsen: ' + url;
    window.location.href = 'sms:?body=' + encodeURIComponent(text);
  }

  function openNativeShare() {
    var url   = document.getElementById('share-link-input').value;
    var title = document.getElementById('share-modal').dataset.title || 'Cykel til salg';
    var text  = 'Tjek denne cykel på Cykelbørsen: ' + title;

    if (navigator.share) {
      navigator.share({ title: title, text: text, url: url })
        .then(function() { showToast('✅ Delt!'); })
        .catch(function() {});
    } else {
      window.open('https://www.addtoany.com/share?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(text), '_blank', 'width=600,height=400');
    }
  }

  return {
    openShareModal,
    closeShareModal,
    copyShareLink,
    shareViaSMS,
    openNativeShare,
    getCurrentShareBikeId: () => currentShareBikeId,
  };
}
