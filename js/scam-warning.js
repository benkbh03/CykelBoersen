/* ============================================================
   ANTI-SCAM WARNING — vises før første besked/bud til en sælger
   ============================================================
   Reducerer fishing/svindel ved at minde brugeren om de tre
   gyldne regler INDEN de tager kontakt for første gang:
     1. Mød offentligt
     2. Tjek stelnummer mod politi.dk
     3. Betal aldrig forud

   Persisterer i localStorage ('cb_scam_warning_ack' = '1')
   så advarslen kun vises én gang per browser. Vi viser den ikke
   ved hver besked — det ville være støjende. Brugeren har
   bekræftet at de har forstået, og guidance er stadig synlig
   som den lille "antiscam-tip"-tekst under handlingsknapperne.
   ============================================================ */

const STORAGE_KEY = 'cb_scam_warning_ack';

/**
 * Vis anti-scam-advarsel hvis brugeren ikke har set den før.
 * @returns {Promise<boolean>} — true når brugeren har bekræftet
 *   (eller advarslen allerede er bekræftet tidligere), false hvis
 *   brugeren annullerer.
 */
export function maybeShowScamWarning() {
  // Allerede set + bekræftet
  try {
    if (localStorage.getItem(STORAGE_KEY) === '1') return Promise.resolve(true);
  } catch (e) { /* localStorage kan være blokeret */ }

  return new Promise((resolve) => {
    // Hvis modal allerede er i DOM (fx hurtig dobbelt-klik), gør intet
    if (document.getElementById('scam-warning-modal')) {
      resolve(false);
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'scam-warning-modal';
    overlay.className = 'scam-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'scam-title');
    overlay.innerHTML = `
      <div class="scam-card" role="document">
        <div class="scam-icon" aria-hidden="true">🛡️</div>
        <h2 id="scam-title" class="scam-title">Inden du tager kontakt</h2>
        <p class="scam-lede">Vi vil hjælpe dig med at handle trygt. Husk disse tre regler — særligt ved køb af brugte cykler:</p>
        <ol class="scam-rules">
          <li>
            <strong>Mød offentligt.</strong>
            <span>Aftal at mødes foran en cykelhandler, politistation eller cafe. Aldrig i sælgers hjem.</span>
          </li>
          <li>
            <strong>Tjek stelnummeret.</strong>
            <span>Bed om stelnummeret før mødet og slå det op gratis hos politiet. Nægter sælger? Drop handlen.</span>
            <a href="https://politi.dk/cykler-og-koeretoejer/tjek-om-en-cykel-eller-et-koeretoej-er-efterlyst/tjek-om-en-cykel-er-efterlyst" target="_blank" rel="noopener" class="scam-link">Tjek stelnummer på politi.dk →</a>
          </li>
          <li>
            <strong>Betal aldrig forud.</strong>
            <span>Betal kun ved levering — kontant eller MobilePay i hånden. Aldrig bankoverførsel uden at have set cyklen.</span>
          </li>
        </ol>
        <div class="scam-actions">
          <button type="button" class="scam-cancel" id="scam-cancel">Annullér</button>
          <button type="button" class="scam-confirm" id="scam-confirm">Forstået, fortsæt</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('scam-overlay-visible'));

    const cleanup = (ack) => {
      overlay.classList.remove('scam-overlay-visible');
      setTimeout(() => {
        overlay.remove();
        document.body.style.overflow = '';
      }, 220);
      if (ack) {
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
      }
      resolve(ack);
    };

    overlay.querySelector('#scam-confirm').addEventListener('click', () => cleanup(true));
    overlay.querySelector('#scam-cancel').addEventListener('click', () => cleanup(false));
    // Klik på baggrund = annullér
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
    // Escape = annullér
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        cleanup(false);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Focus første knap for tilgængelighed
    setTimeout(() => overlay.querySelector('#scam-confirm').focus(), 100);
  });
}

/* Eksporteret til /me hvis vi senere vil tilbyde "Vis advarslen igen" */
export function resetScamWarningAck() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}
