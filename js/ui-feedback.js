export function retryHTML(msg, fn) {
  return `<p style="color:var(--rust)">${msg} <button onclick="${fn}()" style="background:none;border:none;color:var(--rust);text-decoration:underline;cursor:pointer;">Prøv igen</button></p>`;
}

/* Toast med en TYPE i stedet for et emoji foran teksten.

   Baggrund: der havde samlet sig TYVE forskellige praefikser paa 218
   beskeder, heraf sytten emoji. ✅ og ✓ betoed det samme, ⚠️ og ❌ blev
   brugt i flaeng, og en tredjedel havde slet intet. Emoji renderer
   forskelligt paa hvert styresystem, og det var det sidste sted i
   graensefladen de blev brugt som ikoner.

   Nu baerer selve boblen betydningen via en farve fra tilstands-tokens
   i css/01-base.css, og beskeden er ren tekst.

     showToast('Annoncen er gemt', 'ok')
     showToast('Kunne ikke gemme annoncen', 'fejl')
     showToast('Log ind for at gemme annoncer', 'advarsel')
     showToast('Henter din position...')            // neutral

   Vaelg efter hvad brugeren skal goere:
     ok        det lykkedes, ingen handling noedvendig
     fejl      det mislykkedes, og det var ikke brugerens skyld
     advarsel  brugeren skal goere noget foer det kan lykkes
     neutral   status undervejs, hverken godt eller skidt          */
export function showToast(message, type) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = type ? `toast toast--${type}` : 'toast';
  /* Uden clearTimeout arvede den anden toast den foerstes nedtaelling og
     forsvandt for tidligt. Genstart af animationen kraever et reflow. */
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 3500);
}
