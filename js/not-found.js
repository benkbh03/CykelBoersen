/* Visning for en adresse routeren ikke kender.

   GitHub Pages svarer stadig HTTP 404 på selve adressen (404.html), så
   crawlere ser den rigtige status. Før faldt en ukendt sti igennem til
   forsiden, og en besøgende på et dødt annoncelink så hele forsiden uden at
   få at vide, at annoncen var væk. Nu står der det, med én vej videre.

   robots=noindex sættes mens siden vises, og den gamle værdi gemmes på
   tagget, så handleRoute kan lægge den tilbage ved næste navigation
   (restoreRobots). Vi skriver ikke "index, follow" blindt tilbage, fordi
   prerendrede sider kan have noindex i forvejen. */

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
      <button class="btn-primary not-found-btn" onclick="navigateTo('/')">Se alle cykler</button>
    </section>`;
}

export function restoreRobots() {
  const robots = document.querySelector('meta[name="robots"]');
  if (!robots || robots.dataset.nfPrev === undefined) return;
  robots.setAttribute('content', robots.dataset.nfPrev);
  delete robots.dataset.nfPrev;
}
