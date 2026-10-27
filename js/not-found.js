/* Visning for en adresse routeren ikke kender.

   GitHub Pages svarer stadig HTTP 404 på selve adressen (404.html), så
   crawlere ser den rigtige status. Før faldt en ukendt sti igennem til
   forsiden, og en besøgende på et dødt annoncelink så hele forsiden uden at
   få at vide, at annoncen var væk. Nu står der det, med én vej videre.

   robots=noindex sættes mens siden vises, og den gamle værdi gemmes på
   tagget, så handleRoute kan lægge den tilbage ved næste navigation
   (restoreRobots). Vi skriver ikke "index, follow" blindt tilbage, fordi
   prerendrede sider kan have noindex i forvejen.

   Knappen er hvid med kant: "Sæt til salg" i headeren er allerede den
   orange knap i visningen. Kategorierne giver en vej videre for den der
   ledte efter en bestemt slags cykel. */

const CATEGORIES = [
  ['El-cykler', '/el-cykler/'],
  ['Racercykler', '/racercykler/'],
  ['Gravelbikes', '/gravelbikes/'],
  ['Mountainbikes', '/mountainbikes/'],
  ['Ladcykler', '/ladcykler/'],
  ['Citybikes', '/citybikes/'],
  ['Børnecykler', '/boernecykler/'],
];

export function renderNotFoundPage() {
  document.title = 'Siden findes ikke – Cykelbørsen';
  const robots = document.querySelector('meta[name="robots"]');
  if (robots && robots.dataset.nfPrev === undefined) {
    robots.dataset.nfPrev = robots.getAttribute('content') || '';
    robots.setAttribute('content', 'noindex');
  }
  const view = document.getElementById('detail-view');
  if (!view) return;
  view.innerHTML = `
    <section class="not-found" role="alert">
      <h1 class="not-found-title">Siden findes ikke</h1>
      <p class="not-found-text">Linket kan være forkert, eller annoncen er fjernet.</p>
      <button class="not-found-btn" onclick="navigateTo('/')">Se alle cykler</button>
      <h2 class="not-found-sub">Eller se en kategori</h2>
      <ul class="not-found-links">
        ${CATEGORIES.map(([label, href]) => `<li><a href="${href}">${label}</a></li>`).join('')}
      </ul>
    </section>`;
}

export function restoreRobots() {
  const robots = document.querySelector('meta[name="robots"]');
  if (!robots || robots.dataset.nfPrev === undefined) return;
  robots.setAttribute('content', robots.dataset.nfPrev);
  delete robots.dataset.nfPrev;
}
