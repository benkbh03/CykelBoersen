/* ============================================================
   BLOG-INDHOLD
   Hver artikel har slug, title, excerpt, metaDesc, category,
   readTime, publishedAt og body (HTML).
   ============================================================ */

export const BLOG_ARTICLES = {
  'hvilken-cykel-skal-jeg-vaelge': {
    slug: 'hvilken-cykel-skal-jeg-vaelge',
    title: 'Hvilken cykel skal jeg vælge? Guide til nybegyndere',
    excerpt: 'Ny til cykler? Sådan finder du ud af om du skal have en racercykel, en gravelbike, en mountainbike, en citybike eller en el-cykel.',
    metaDesc: 'Hvilken cykel skal jeg købe? Forskellen på racercykel, gravelbike, mountainbike, citybike og el-cykel forklaret for nybegyndere. Guide fra Cykelbørsen.',
    category: 'Guides',
    readTime: 7,
    publishedAt: '2026-11-03',
    body: `
      <p>Det første spørgsmål er ikke mærke eller pris. Det er hvor du skal køre. En cykel der er bygget til asfalt, er hård og langsom i skoven, og en mountainbike føles tung på landevejen. Vælger du den rigtige type fra starten, kan næsten enhver model i den type gøre dig glad.</p>
      <p>Svar på tre spørgsmål, før du kigger på annoncer:</p>
      <ol>
        <li><strong>Underlaget:</strong> asfalt, grusveje eller skovstier?</li>
        <li><strong>Formålet:</strong> transport til arbejde, motion og træning, eller sjov i terrænet?</li>
        <li><strong>Afstanden:</strong> under 5 km, 5-15 km eller længere ture?</li>
      </ol>

      <h2>Typerne side om side</h2>
      <table>
        <thead><tr><th>Type</th><th>Bedst til</th></tr></thead>
        <tbody>
          <tr><td>Racercykel</td><td>Fart på asfalt, motion og lange ture</td></tr>
          <tr><td>Gravelbike</td><td>Asfalt og grus, pendling og ture på landet</td></tr>
          <tr><td>Mountainbike</td><td>Skovstier, rødder og bakker</td></tr>
          <tr><td>Citybike</td><td>Korte ture i byen, indkøb og opretsiddende komfort</td></tr>
          <tr><td>El-cykel</td><td>Lange pendlerture, modvind og bakker uden at svede</td></tr>
          <tr><td>Ladcykel</td><td>Børn og varer, i stedet for bil nummer to</td></tr>
        </tbody>
      </table>

      <h2>Racercykel: til asfalt og fart</h2>
      <p>En racercykel har smalle dæk (typisk 25-32 mm), bøjlestyr og en fremoverbøjet siddestilling. Den er let og hurtig, og den er bygget til at køre langt på asfalt. Til gengæld er den ubehagelig på grus og brosten, og der er sjældent plads til skærme og bagagebærer.</p>
      <p>Vælg en racer hvis du vil træne, køre med en klub eller tage lange ture i weekenden. Skal cyklen også bruges til pendling i al slags vejr, så kig på gravel i stedet.</p>
      <p><a href="/racercykler/" onclick="event.preventDefault();navigateTo('/racercykler')">Se racercykler til salg</a></p>

      <h2>Gravelbike: den alsidige</h2>
      <p>En gravelbike ligner en racer med bøjlestyr, men har bredere dæk (typisk 35-45 mm), en mere afslappet geometri og som regel skivebremser. Den kører næsten lige så let på asfalt og kan klare grusveje, markveje og lette skovstier. Mange har huller til skærme og bagagebærer.</p>
      <p>Er du i tvivl mellem racer og gravel, er gravel det sikre valg for de fleste nybegyndere. Den kan det meste, og du kan skifte til smallere dæk hvis du mest kører på vej.</p>
      <p><a href="/gravelbikes/" onclick="event.preventDefault();navigateTo('/gravelbikes')">Se gravelbikes til salg</a></p>

      <h2>Mountainbike: til skov og terræn</h2>
      <p>En mountainbike (MTB) har brede knobbede dæk, lige styr, kraftige skivebremser og affjedring. Den er lavet til stier med rødder, sten og stejle bakker. På asfalt er den tung og langsom, så den er et dårligt valg som pendlercykel.</p>
      <p>Det vigtigste valg på en MTB er affjedringen: kun foran (hardtail) eller både foran og bagpå (fully). Det har vi skrevet en særskilt guide om: <a href="/blog/mtb-affjedring-guide/" onclick="event.preventDefault();navigateTo('/blog/mtb-affjedring-guide')">hardtail eller fully</a>.</p>
      <p><a href="/mountainbikes/" onclick="event.preventDefault();navigateTo('/mountainbikes')">Se mountainbikes til salg</a></p>

      <h2>Citybike: til hverdagen i byen</h2>
      <p>En citybike har opretsiddende stilling, skærme, kædeskærm, lygter og ofte navgear med 3-8 gear, som næsten ikke kræver vedligehold. Den er tung, men den er bygget til at stå ude og blive brugt hver dag. Til ture under 5 km i byen er den svær at slå.</p>
      <p>Mellemvejen er en hybridcykel (også kaldet trekking- eller fitnesscykel): lige styr, lettere stel og flere gear. Den passer til længere pendlerture, hvor en citybike bliver for tung.</p>
      <p><a href="/citybikes/" onclick="event.preventDefault();navigateTo('/citybikes')">Se citybikes til salg</a></p>

      <h2>El-cykel: når afstanden er lang</h2>
      <p>En el-cykel hjælper dig op til 25 km/t, når du træder. Det gør 15-20 km til arbejde realistisk hver dag, også i modvind. Prisen er vægt (typisk 22-28 kg), en højere pris og et batteri, der slides og en dag skal skiftes.</p>
      <p>El-cykler findes som citybike, MTB, gravel og ladcykel. Vælg typen først efter underlaget, og vælg så om den skal have motor. Køber du brugt, så læs vores <a href="/blog/koeb-brugt-el-cykel/" onclick="event.preventDefault();navigateTo('/blog/koeb-brugt-el-cykel')">7 ting at tjekke ved en brugt el-cykel</a>.</p>
      <p><a href="/el-cykler/" onclick="event.preventDefault();navigateTo('/el-cykler')">Se el-cykler til salg</a></p>

      <h2>Ladcykel: to eller tre hjul</h2>
      <p>En ladcykel på to hjul (som Bullitt eller Omnium) er smallere, hurtigere og kører som en almindelig cykel, når man har vænnet sig til den. En trehjulet ladcykel (som Christiania eller Babboe Curve) står selv, når du holder stille, og føles tryg med børn i kassen, men den er bredere og kræver mere plads at parkere. Mange ladcykler i dag har el-motor.</p>
      <p><a href="/ladcykler/" onclick="event.preventDefault();navigateTo('/ladcykler')">Se ladcykler til salg</a></p>

      <h2>Når du har valgt type</h2>
      <p>Næste skridt er størrelsen. En god cykel i forkert størrelse bliver ubehagelig at køre på, så brug vores <a href="/stelstoerrelse-guide/" onclick="event.preventDefault();navigateTo('/stelstoerrelse-guide')">stelstørrelse-finder</a>. Køber du brugt, så gå cyklen igennem med vores <a href="/guide/tjek-brugt-cykel/" onclick="event.preventDefault();navigateTo('/guide/tjek-brugt-cykel')">tjekliste til brugte cykler</a>, før du betaler.</p>
      <p>Brugt er en god vej ind for en nybegynder. Du får mere cykel for pengene, og finder du ud af at typen ikke passer, kan du sælge den igen uden at tabe ret meget. Kommer den rigtige cykel ikke op med det samme, så <a href="/cykelagenter/" onclick="event.preventDefault();navigateTo('/cykelagenter')">opret en Cykelagent</a>, så får du en mail, når den bliver sat til salg.</p>
    `,
  },

  'shimano-sram-gear-forklaret': {
    slug: 'shimano-sram-gear-forklaret',
    title: 'Shimano og SRAM gear forklaret: hvad er pengene værd?',
    excerpt: 'Hvad betyder "Shimano 105" eller "SRAM GX" i en annonce, og er prisforskellen pengene værd? Gearniveauerne forklaret for nybegyndere.',
    metaDesc: 'Shimano og SRAM gearniveauer forklaret: Claris, Tiagra, 105, Ultegra, Dura-Ace, GRX, Deore, XT og SRAM Apex, Rival, Force, Red, GX. Hvad er pengene værd?',
    category: 'Guides',
    readTime: 8,
    publishedAt: '2026-11-03',
    body: `
      <p>I næsten hver annonce på en racercykel, gravelbike eller mountainbike står der et navn som "Shimano 105", "SRAM Rival" eller "Deore". Det er gruppesættet: gearskifter, bagskifter, kranksæt, kassette, kæde og ofte bremserne. Gruppesættet er den hurtigste måde at bedømme hvilket niveau en cykel ligger på, også når du ikke kender mærket.</p>
      <p>Kort sagt: jo højere niveau, jo lettere og mere præcist. Men forskellen er størst i bunden. Springet fra det billigste niveau til mellemklassen mærker alle. Springet fra mellemklassen til toppen handler mest om vægt.</p>

      <h2>Shimano til racer og gravel</h2>
      <p>Fra billigst til dyrest:</p>
      <table>
        <thead><tr><th>Gruppe</th><th>Hvad det betyder for dig</th></tr></thead>
        <tbody>
          <tr><td>Claris</td><td>8 gear bagpå. Begyndercykler og pendling</td></tr>
          <tr><td>Sora</td><td>9 gear. Lidt bedre, stadig begynderniveau</td></tr>
          <tr><td>Tiagra</td><td>10 gear. God til motion og pendling</td></tr>
          <tr><td>105</td><td>11 eller 12 gear. Det niveau de fleste motionister vælger</td></tr>
          <tr><td>Ultegra</td><td>Som 105, men lettere og mere forfinet</td></tr>
          <tr><td>Dura-Ace</td><td>Shimanos topgruppe til konkurrence</td></tr>
        </tbody>
      </table>
      <p><strong>Shimano 105 er det sikre valg.</strong> Det skifter næsten lige så godt som Ultegra, og reservedele er billige og lette at skaffe. Ultegra og Dura-Ace er bedre, men du betaler mest for færre gram. Til gravel har Shimano en særlig gruppe, <strong>GRX</strong>, med lavere gearing til grus og bakker.</p>
      <p>Står der <strong>Di2</strong>, er gearskiftet elektronisk: knapperne sender et signal, og en motor flytter kæden. Det skifter præcist hver gang, men batteriet skal lades, og reparationer er dyrere.</p>

      <h2>SRAM til racer og gravel</h2>
      <table>
        <thead><tr><th>Gruppe</th><th>Svarer omtrent til</th></tr></thead>
        <tbody>
          <tr><td>Apex</td><td>Tiagra til 105. Ofte på gravel</td></tr>
          <tr><td>Rival</td><td>105</td></tr>
          <tr><td>Force</td><td>Ultegra</td></tr>
          <tr><td>Red</td><td>Dura-Ace</td></tr>
        </tbody>
      </table>
      <p><strong>AXS</strong> betyder trådløst elektronisk gearskifte, SRAMs svar på Di2. <strong>XPLR</strong> er SRAMs gravel-udgave: én klinge foran og en bred kassette bagpå. Ældre mekaniske SRAM-grupper hedder fx "Rival 22" eller "Force 22", hvor 22 betyder 2 klinger foran og 11 bagpå.</p>
      <p>Campagnolo er det tredje store mærke. Til gravel er <strong>Ekar</strong> med 13 gear det mest udbredte.</p>

      <h2>Shimano til mountainbike</h2>
      <table>
        <thead><tr><th>Gruppe</th><th>Hvad det betyder for dig</th></tr></thead>
        <tbody>
          <tr><td>Tourney, Altus, Acera</td><td>Billige cykler og hybridcykler. Ikke til rigtig terrænkørsel</td></tr>
          <tr><td>Alivio, Cues</td><td>Robust begynderniveau</td></tr>
          <tr><td>Deore</td><td>Første niveau der holder til stier. Godt sted at starte</td></tr>
          <tr><td>SLX</td><td>Lettere og skarpere end Deore</td></tr>
          <tr><td>XT</td><td>Det foretrukne valg til seriøs kørsel</td></tr>
          <tr><td>XTR</td><td>Topgruppe til konkurrence</td></tr>
        </tbody>
      </table>
      <p>Skal mountainbiken bruges på stier i skoven, så gå efter <strong>Deore eller bedre</strong>. Under Deore er delene bygget til cykelsti og grusvej.</p>

      <h2>SRAM til mountainbike</h2>
      <p>SRAMs MTB-grupper hedder Eagle og har 12 gear. Fra billigst til dyrest: <strong>SX, NX, GX, X01 og XX1</strong>. NX svarer omtrent til Deore, GX til SLX og XT, og X01 og XX1 til XTR. Nyere cykler har <strong>Transmission</strong> (T-Type), hvor bagskifteren sidder direkte på rammen uden et skifteøje. Den er meget robust, men kræver en ramme der er lavet til den.</p>

      <h2>Sådan bruger du det, når du køber brugt</h2>
      <ul>
        <li><strong>Tjek hele gruppen, ikke kun bagskifteren.</strong> En cykel kan have en Ultegra-bagskifter og resten i 105 eller billigere. Annoncen nævner ofte den dyreste del. Kig på gearhåndtagene og kranksættet.</li>
        <li><strong>Antal gear siger noget om alder.</strong> 11 gear på 105 var standard fra 2014 til 2022, 12 gear er nyere. Reservedele til ældre grupper findes stadig, men de bliver sværere at finde med tiden.</li>
        <li><strong>Slid koster mest på de dyre niveauer.</strong> En ny kassette og kæde til Dura-Ace koster mange gange mere end til Tiagra. Tjek slid på kæden, før du betaler.</li>
        <li><strong>En brugt cykel med 105 slår ofte en ny med Claris</strong> til samme pris. Det er den største fordel ved at købe brugt.</li>
      </ul>
      <p>På forsiden af Cykelbørsen kan du filtrere på gruppesæt, fx Shimano 105, Ultegra, GRX, Deore og XT eller SRAM Rival, Force og Apex. Se <a href="/racercykler/" onclick="event.preventDefault();navigateTo('/racercykler')">racercykler</a>, <a href="/gravelbikes/" onclick="event.preventDefault();navigateTo('/gravelbikes')">gravelbikes</a> eller <a href="/mountainbikes/" onclick="event.preventDefault();navigateTo('/mountainbikes')">mountainbikes</a> til salg, eller gå igennem en brugt cykel med vores <a href="/guide/tjek-brugt-cykel/" onclick="event.preventDefault();navigateTo('/guide/tjek-brugt-cykel')">tjekliste</a>.</p>
    `,
  },

  'find-den-rigtige-sadel': {
    slug: 'find-den-rigtige-sadel',
    title: 'Find den rigtige sadel: mål siddeknogler og sadelhøjde',
    excerpt: 'Ondt bagi efter en tur skyldes oftest en sadel i forkert bredde eller højde. Sådan måler du begge dele derhjemme med et stykke pap og et målebånd.',
    metaDesc: 'Hvilken sadelbredde passer mig? Mål dine siddeknogler med et stykke pap og find den rigtige sadelhøjde. Til racer, gravel, MTB og citybike.',
    category: 'Guides',
    readTime: 6,
    publishedAt: '2026-11-03',
    body: `
      <p>En sadel skal ikke være blød. Den skal være bred nok til at dine to siddeknogler hviler på den. Er den for smal, sidder du på det bløde væv imellem knoglerne, og det gør ondt efter en halv time. Er den for bred, gnaver den på indersiden af lårene. Bredden kan du måle derhjemme på fem minutter.</p>

      <h2>Mål dine siddeknogler med et stykke pap</h2>
      <p>Du skal bruge et stykke bølgepap (en papkasse), en blyant og en lineal.</p>
      <ol>
        <li>Læg pappet på en lav stol eller et trappetrin uden hynde. Et blødt underlag som en tæppebelagt trappe giver det tydeligste aftryk.</li>
        <li>Sæt dig på pappet med bukser på, løft fødderne fra gulvet og læn dig lidt frem, som du sidder på cyklen. Bliv siddende et halvt minut.</li>
        <li>Rejs dig. Der er nu to fordybninger i pappet. Er de svære at se, så skrab let hen over med blyanten.</li>
        <li>Sæt et kryds midt i hver fordybning, og mål afstanden mellem de to kryds i millimeter.</li>
      </ol>
      <p>De fleste voksne ligger mellem 100 og 160 mm. Mål et par gange og brug gennemsnittet. Kropsstørrelse og køn siger mindre om tallet, end man skulle tro, så mål hellere end at gætte.</p>

      <h2>Sådan finder du sadelbredden</h2>
      <p>Sadlen skal være bredere end afstanden mellem siddeknoglerne. Hvor meget bredere afhænger af, hvordan du sidder. Jo mere du læner dig frem, jo mere ruller bækkenet fremad, og jo smallere en sadel kan du bruge.</p>
      <table>
        <thead><tr><th>Cykel og siddestilling</th><th>Læg til dit mål</th></tr></thead>
        <tbody>
          <tr><td>Racer, lav og fremoverbøjet</td><td>ca. 20 mm</td></tr>
          <tr><td>Racer og gravel, mere oprejst</td><td>ca. 25-30 mm</td></tr>
          <tr><td>Mountainbike</td><td>ca. 30 mm</td></tr>
          <tr><td>Citybike og hybrid, oprejst</td><td>ca. 40 mm eller mere</td></tr>
        </tbody>
      </table>
      <p><strong>Eksempel:</strong> du måler 125 mm og kører gravel. 125 + 25-30 giver en sadel på ca. 150-155 mm. Mange mærker laver sadler i faste bredder, fx 130, 143, 155 og 168 mm, så du vælger den nærmeste.</p>
      <p>Tabellen er et udgangspunkt, ikke en lov. Mange cykelforhandlere har en måleplade, og nogle har testsadler, du kan låne.</p>

      <h2>Sadelhøjden: hælmetoden</h2>
      <p>En sadel i den rigtige bredde hjælper ikke, hvis den sidder for lavt. Så belaster du knæene, og du bruger mere kraft end nødvendigt. Den nemmeste måde at finde højden:</p>
      <ol>
        <li>Sæt dig på cyklen i de sko, du plejer at køre i. Støt dig til en væg.</li>
        <li>Sæt hælen på pedalen og træd den helt ned i bunden.</li>
        <li>Benet skal nu være helt strakt, uden at hoften vipper til siden.</li>
        <li>Når du kører med fodballen på pedalen, får du automatisk en lille bøjning i knæet. Det er den, du vil have.</li>
      </ol>
      <p>Vil du regne den ud, så mål din skridtlængde: stå op ad en væg uden sko med en bog klemt op mellem benene, og mål fra gulvet til bogens overkant. Gang med 0,883. Det giver afstanden fra midten af krankakslen til toppen af sadlen. Skridtlængde 82 cm giver fx ca. 72,5 cm.</p>
      <p>På en citybike, hvor du ofte stopper og vil kunne nå jorden, kan sadlen godt sidde et par centimeter lavere. Justér højst en halv centimeter ad gangen, og kør et par ture imellem.</p>

      <h2>Vinkel og placering</h2>
      <p>Sadlen skal som udgangspunkt sidde vandret. Læg et vaterpas eller en lige bog oven på den. Glider du frem mod styret, sidder spidsen for lavt. Trykker det foran, så vip spidsen en anelse ned, højst et par grader.</p>

      <h2>Køber du brugt</h2>
      <p>En sadel er en af de billigste dele at skifte. Lad ikke en forkert sadel afgøre, om du køber en ellers god brugt cykel. Det vigtige er, at stellet passer, og det tjekker du med vores <a href="/stelstoerrelse-guide/" onclick="event.preventDefault();navigateTo('/stelstoerrelse-guide')">stelstørrelse-finder</a>. Tjek til gengæld at sadelpinden kan komme op i den højde, du skal bruge, og at den ikke sidder fast. En sadelpind der er rustet fast i stellet, kan være svær at få løs.</p>
      <p>Er du ny til cykler og ikke sikker på, hvilken type du skal have, så start med guiden <a href="/blog/hvilken-cykel-skal-jeg-vaelge/" onclick="event.preventDefault();navigateTo('/blog/hvilken-cykel-skal-jeg-vaelge')">hvilken cykel skal jeg vælge</a>.</p>
    `,
  },

  'mtb-affjedring-guide': {
    slug: 'mtb-affjedring-guide',
    title: 'Hardtail eller fully? Vælg den rigtige affjedring til din mountainbike',
    excerpt: 'Den vigtigste beslutning når du køber en MTB er ikke mærket, men affjedringen. Sådan vælger du mellem hardtail og fuld affjedring.',
    metaDesc: 'Hardtail vs fuld affjedring (fully): hvad passer til din kørsel, dit budget og dit vedligehold. Komplet MTB-affjedringsguide fra Cykelbørsen.',
    category: 'Guides',
    readTime: 6,
    publishedAt: '2026-05-24',
    body: `
      <p>Når folk skal købe deres første rigtige mountainbike, går de ofte direkte til mærke og pris. Men den beslutning der betyder mest for hvordan cyklen føles under dig, er affjedringen. Valget står typisk mellem en hardtail med affjedring kun foran og en fully med affjedring både for og bag, og det rigtige svar afhænger næsten udelukkende af hvor og hvordan du kører.</p>

      <h2>De tre typer kort fortalt</h2>
      <p><strong>Forgaffel (hardtail)</strong> betyder at cyklen kun har affjedring i forgaflen. Bagenden er stiv. Det er den mest udbredte type til alt fra skovveje til lettere stier.</p>
      <p><strong>Fuld affjedring (fully)</strong> har både en affjedret forgaffel og en bagdæmper. Bagenden bevæger sig, så begge hjul kan følge terrænet uafhængigt. Det er standarden til teknisk kørsel, downhill og enduro.</p>
      <p><strong>Ingen (stiv)</strong> er en helt ufjedret ramme. Den ses sjældent på moderne MTB, men findes på dirt jump-cykler og nogle robuste pendlercykler.</p>

      <h2>Hardtail: let, billig og driftssikker</h2>
      <p>En hardtail giver dig mest cykel for pengene. Fordi der ikke skal betales for en bagdæmper og de tilhørende lejer, går flere af dine kroner til gear, bremser og hjul. En hardtail til 10.000 kr har næsten altid bedre komponenter end en fully til samme pris.</p>
      <p>Den er også lettere, kræver mindre vedligehold og tråder mere effektivt i opstigninger og på fast underlag. Hvis du primært kører på grusveje, skovveje, lettere singletrack eller bruger cyklen som en hurtig allround-cykel, er en hardtail oftest det rigtige valg. Det er også den klogeste start for de fleste begyndere.</p>

      <div style="display:flex;flex-wrap:wrap;gap:10px;margin:22px 0;">
        <a href="/" onclick="event.preventDefault();applyPopularSearch({type:'Mountainbike', suspension:'Forgaffel (hardtail)'})" style="background:var(--rust);color:#fff;padding:11px 18px;border-radius:10px;text-decoration:none;font-weight:var(--weight-semibold);display:inline-block;">Se hardtail-mountainbikes</a>
      </div>

      <h2>Fully: kontrol og komfort på det tekniske</h2>
      <p>En fully kommer til sin ret når terrænet bliver groft. Bagdæmperen holder baghjulet i kontakt med jorden over rødder, sten og trapper, og det giver markant mere greb, kontrol og komfort på stejle og tekniske nedkørsler. Kører du rigtige trails, enduro eller downhill, er fuld affjedring svær at undvære.</p>
      <p>Prisen er vægt, kroner og vedligehold. En fully er tungere, dyrere ved samme komponentniveau, og bagdæmper, lejer og pivotpunkter skal serviceres og slides over tid. Det er ikke afskrækkende, men det er en omkostning du skal regne med.</p>

      <div style="display:flex;flex-wrap:wrap;gap:10px;margin:22px 0;">
        <a href="/" onclick="event.preventDefault();applyPopularSearch({type:'Mountainbike', suspension:'Fuld affjedring (fully)'})" style="background:var(--rust);color:#fff;padding:11px 18px;border-radius:var(--radius-sm);text-decoration:none;font-weight:var(--weight-semibold);display:inline-block;">Se fuldaffjedrede mountainbikes</a>
      </div>

      <h2>Sådan vælger du efter din kørsel</h2>
      <p>Kører du mest by, grus og skovveje, eller har du et stramt budget og vil have mest muligt for pengene, så peger alt mod en <strong>hardtail</strong>. Kører du teknisk singletrack, stejle nedkørsler, enduro eller downhill, og vil du have maksimal kontrol, så er en <strong>fully</strong> pengene værd. Er du i tvivl og kører blandet, er en god hardtail næsten altid det mere fornuftige førstevalg, og du kan altid rykke op i en fully senere når du ved hvad du har brug for.</p>

      <h2>Ekstra tjek når du køber brugt</h2>
      <p>På en brugt fully skal du være ekstra grundig. Tag fat i baghjulet og vrik fra side til side for at mærke efter slør i pivotlejerne. Tryk dæmperen sammen og lyt efter raslen eller utætheder, og kig efter olie omkring dæmperen og forgaflen, da det kan betyde at en service er på vej. På en hardtail er der færre bevægelige dele at bekymre sig om, hvilket er endnu en grund til at den ofte er et trygt brugtkøb. Læs vores generelle <a href="/guide/tjek-brugt-cykel/" onclick="event.preventDefault();navigateTo('/guide/tjek-brugt-cykel')" style="color:var(--rust);text-decoration:underline;">guide til at tjekke en brugt cykel</a> inden du handler.</p>

      <h2>Find din næste MTB</h2>
      <p>Når du har besluttet dig for affjedringstype, kan du filtrere direkte på den her på Cykelbørsen sammen med gear, bremser, stelstørrelse og pris. Og dukker den rigtige cykel ikke op endnu, så <a href="/cykelagenter/" onclick="event.preventDefault();navigateTo('/cykelagenter')" style="color:var(--rust);text-decoration:underline;">opret en Cykelagent</a>, så får du en mail så snart en MTB der matcher netop dine kriterier bliver sat til salg.</p>
    `,
  },

  'undgaa-stjaalet-cykel': {
    slug: 'undgaa-stjaalet-cykel',
    title: 'Sådan undgår du at købe en stjålet cykel',
    excerpt: 'Køber du en stjålet cykel, mister du både cyklen og pengene. Sådan undgår du det.',
    metaDesc: 'Sådan undgår du at købe en stjålet cykel: stelnummer-tjek, røde flag og dokumentation. Komplet guide fra Cykelbørsen.',
    category: 'Sikkerhed',
    readTime: 4,
    publishedAt: '2026-05-11',
    body: `
      <p>Tjek cyklen, inden du betaler. Viser den sig at være stjålet, skal den tilbage til ejeren, og du står uden både cykel og penge. Det kan man stort set altid undgå med få minutters opmærksomhed inden handlen.</p>

      <h2>Stelnummeret er udgangspunktet</h2>
      <p>Bed om stelnummeret, inden I mødes, og slå det op i politiets register over stjålne cykler. Hvor nummeret sidder, hvordan du slår det op, og hvor I bør mødes, står i vores <a href="/sikkerhedsguide/" onclick="event.preventDefault();navigateTo('/sikkerhedsguide')">sikkerhedsguide</a>.</p>

      <h2>Prisen siger ofte en hel del</h2>
      <p>Slå normalprisen for modellen op, gerne i Cykelbørsens <a href="/vurder-min-cykel/" onclick="event.preventDefault();navigateTo('/vurder-min-cykel')">vurderingsværktøj</a>. Ligger prisen 30 procent under markedet, så stil dig selv spørgsmålet hvorfor.</p>
      <p>Sælger har måske en troværdig forklaring. Familien flytter, der er pludseligt brug for kontanter, eller cyklen skal bare væk hurtigt. Det er klart situationer der findes i virkeligheden. Men det er også de klassiske svindelhistorier, så vær særligt på vagt hvis cyklen samtidig fremstår uden et eneste brugsspor selvom prisen er meget lav.</p>

      <h2>Spørg til historikken</h2>
      <p>En reel ejer kan typisk fremvise enten den originale kvittering, en servicehistorik fra en forhandler, billeder af registreringen hos sit forsikringsselskab, eller den tidligere annonce på Cykelbørsen hvis cyklen er købt brugt. Det er ikke ensbetydende med at en sælger uden papirer har stjålet cyklen, da mange privatpersoner smider kvitteringer ud over årene. Men kombineret med andre advarselstegn er det værd at tøve.</p>

      <h2>Hvis det alligevel går galt</h2>
      <p>Skulle det vise sig, at cyklen var stjålet, så aflevér den til politiet med det samme. Du må ikke beholde stjålne genstande, heller ikke selvom du købte i god tro. Anmeld sælger med den dokumentation du har, kontakt din bank for at høre om chargeback (det er muligt op til 30 dage hvis du betalte med kort eller MobilePay), og overvej at rejse et civilretligt krav.</p>
      <p>I praksis er det dog ofte svært at få pengene tilbage hvis sælger forsvinder eller har brugt falsk identitet. Derfor er forebyggelsen langt vigtigere end alt det man kan gøre bagefter.</p>

      <h2>Det tager få minutter</h2>
      <p>Tjekkene her tager få minutter, og det er langt billigere end at stå uden både cykel og penge bagefter.</p>
    `,
  },

  'cykelstoerrelse-guide': {
    slug: 'cykelstoerrelse-guide',
    title: 'Hvilken cykelstørrelse passer mig?',
    excerpt: 'Højde er kun udgangspunktet. Sådan finder du den rigtige stelstørrelse uanset cykeltype.',
    metaDesc: 'Find den rigtige cykelstørrelse: tabel over højde og stelstørrelse for racer, MTB, citybike. Plus måleguide og prøvetur-tips.',
    category: 'Guides',
    readTime: 6,
    publishedAt: '2026-05-11',
    body: `
      <p>At købe en cykel der ikke passer er en af de hyppigste måder at spilde penge på. Den ender enten i kælderen eller bliver solgt videre med tab efter et par måneder. Heldigvis er det ikke så svært at ramme den rigtige størrelse, hvis man forstår de tre faktorer der spiller ind: højde, benlængde og cykeltype.</p>

      <h2>Højde er kun udgangspunktet</h2>
      <p>Højden er det første mange tænker på, og den er et fint sted at begynde. Problemet er, at den ikke fortæller hele historien. To personer på 175 cm kan sagtens have ti centimeters forskel i benlængde, og det betyder ofte at den ene skal have S mens den anden skal have M. Vælger man udelukkende efter højde, rammer omkring en tredjedel forkert. Derfor er det værd at måle sin benlængde også. Det tager et minut.</p>

      <h2>Sådan måler du din benlængde</h2>
      <p>Tag skoene af og stil dig med ryggen mod en væg. Sæt en bog mellem benene, så den støder op til skridtet omtrent som en sadel ville gøre. Mål så fra toppen af bogen og ned til gulvet. Tallet du får er din benlængde eller "inseam", og det er det vigtigste mål når du skal vælge cykelstørrelse.</p>

      <h2>Stelstørrelse efter højde for racercykler</h2>
      <p>Som vejledende udgangspunkt passer 150-159 cm til en XS-ramme på 44-47 cm, mens 160-167 cm hører til en S på 48-51 cm. Er du 168-175 cm skal du typisk have en M på 52-55 cm, 176-184 cm passer til en L på 56-58 cm, og er du 185 cm eller derover har du brug for en XL på 59 cm eller derover.</p>
      <p>Mountainbikes er en lille smule mindre per højdetrin, fordi du sidder mere oprejst og har brug for mere plads over rammen ved offroad-kørsel. Citybikes er endnu mere komfortable og oprejste, og her er det vigtigste at du kan sætte begge fødder fast på jorden ved stop.</p>

      <h2>Prøveturen er afgørende</h2>
      <p>Når du har fundet en cykel der lyder rigtigt på papir, så tag en kort tur. Tjek først at du kan stå af cyklen med begge fødder fladt på jorden. Når du sætter dig og trækker den ene pedal helt ned, skal benet være næsten strakt med kun en let bøjning. Du må hverken være presset sammen eller overstrakt mod styret. Og efter fem minutter skal hverken ryggen, knæene eller håndleddene gøre ondt. Hvis de gør, er størrelsen forkert uanset hvad tabellerne siger.</p>

      <h2>Hvis du er mellem to størrelser</h2>
      <p>Det er en situation mange ender i. Er du for eksempel 178 cm, ligger du i grænselandet mellem M og L. Her er det værd at se på proportioner og kørestil.</p>
      <p>Har du forholdsvis korte ben og en lang overkrop, og kører du primært i byen, vil du sandsynligvis være bedre tjent med S eller M. Foretrækker du en oprejst position over en strakt, peger det samme vej. Har du derimod lange ben og en kort overkrop, eller foretrækker du race-positionen, så bør du vælge M eller L. En lille ramme kan altid "vokse" lidt med en længere sadelpind, men en for stor ramme kan ikke krympes.</p>

      <h2>Husk forskellen mellem mærker</h2>
      <p>Trek, Cube, Specialized og de andre store mærker har lidt forskellige geometrier. En M-ramme fra ét mærke svarer ikke til en M fra et andet på centimeter. Tjek altid producentens egen størrelsesguide for den specifikke model når du er tæt på at købe.</p>

      <h2>Hovedpointen</h2>
      <p>Brug højdetabellen som udgangspunkt, mål din benlængde hvis du er i tvivl, og lav altid en prøvetur. Fem minutter på cyklen sparer dig for fem år i kælderen med en cykel der aldrig kom rigtigt i brug. På Cykelbørsen kan du filtrere annoncer efter stelstørrelse, så du kun ser de cykler der passer dig.</p>
    `,
  },

  'koeb-brugt-el-cykel': {
    slug: 'koeb-brugt-el-cykel',
    title: 'Køb brugt el-cykel: 7 ting du skal tjekke',
    excerpt: 'Brugte e-cykler kan være en god handel. Sådan undgår du at købe en med udslidt batteri eller knækkende motor.',
    metaDesc: 'Køb brugt el-cykel sikkert: tjek batteri, motor, hjul og bremser. Spørgsmål du skal stille sælger.',
    category: 'Køb',
    readTime: 5,
    publishedAt: '2026-05-11',
    body: `
      <p>Brugte el-cykler kan være en rigtig god handel. Du sparer typisk mellem 30 og 50 procent i forhold til ny pris. Men en e-cykel har flere kritiske komponenter end en almindelig cykel (batteri, motor, controller og display), og hver af dem kan koste fem til femten tusind kroner at udskifte. Det er derfor det er værd at bruge et kvarter på at tjekke en brugt e-cykel grundigt igennem inden du betaler.</p>

      <h2>Batteriets sundhed kommer først</h2>
      <p>Batteriet er den dyreste enkeltdel og den der slides hurtigst. Et nyt originalbatteri koster typisk mellem 4.000 og 8.000 kr afhængig af mærke. Er batteriet udslidt er hele besparelsen ofte tabt.</p>
      <p>Det vigtigste er at få et indtryk af hvor langt cyklen er kørt. Spørg sælger hvor mange kilometer den har på sig, og hvor mange opladninger batteriet har været igennem. Motorer fra Bosch, Yamaha og Shimano viser ofte tallet direkte i displayet. Den typiske slidgrænse ligger omkring 15.000-25.000 km, hvilket svarer til mellem 500 og 1.000 opladninger.</p>
      <p>Lige så vigtigt er at høre hvor langt cyklen kommer på fuld opladning i dag, sammenlignet med da den var ny. Er rækkevidden faldet til under 60 procent af original, er batteriet på vej ud. En prøvetur er en god måde at få fornemmelse for det, særligt op ad en bakke hvor du virkelig mærker assistansen.</p>

      <h2>Lyt og mærk motoren</h2>
      <p>Motorer fra de store mærker holder normalt 30.000 til 50.000 km hvis de er behandlet ordentligt. På prøveturen skal du lytte efter knirken når du træder, og mærke efter om assistansen kommer jævnt eller i ryk. Hvis motoren laver klikkende lyde eller assistansen falder kortvarigt ud, så drop handlen. En motorreparation kan let koste 10.000 kr eller mere.</p>

      <h2>Test display og lygter</h2>
      <p>Tjek alle funktioner mens du er ved cyklen. Displayet skal tænde klart og vise data uden problemer. Du skal kunne skifte mellem alle assistanseniveauer, og lygterne, som ofte hænger sammen med motoren, skal virke. Hvis cyklen har en USB-port til at oplade telefon, så test også den.</p>

      <h2>Drivlinjen slides hurtigere</h2>
      <p>El-cykler sliser kæden, kassetten og krans markant hurtigere end almindelige cykler, fordi motoren tilfører ekstra kraft. En komplet ny drivlinje koster typisk mellem 1.500 og 3.000 kr. Spørg sælger hvornår kæden sidst er skiftet, og overvej at tage en lille kæde-slidmåler med fra cykelhandleren. De koster en 10-20 kr og giver et præcist svar på stedet.</p>

      <h2>Bremserne arbejder hårdere</h2>
      <p>Den højere fart og den ekstra vægt på en e-cykel betyder at bremserne bliver belastet mere end på en almindelig cykel. Skivebremser er standard på moderne e-cykler. Tjek at bremseklodserne har mindst en millimeter slidlag tilbage, at skiverne ikke er nedslidte eller bøjede, og at cyklen kan bremses hårdt fra omkring 20 km/t uden problemer.</p>

      <h2>Hjul, dæk og lejer</h2>
      <p>De fleste e-cykler kører på 28-tommer hjul med bredere dæk end almindelige bycykler. Du vil have minimum to-tre millimeters mønsterdybde tilbage. Når du løfter hjulet og snurrer det, skal det dreje jævnt uden at give lyde fra sig. Niv på egerne på det bagerste hjul. Løse eger giver skæve hjul og kan knække senere.</p>

      <h2>Service og garanti</h2>
      <p>Hør sælger om hvornår motoren sidst er inspiceret, og om der stadig er garanti tilbage. Bosch-motorer har typisk to års garanti og det samme gælder batterier, men nogle producenter kræver at garantien er registreret hos den oprindelige ejer for at kunne overdrages. Det er værd at få afklaret inden handlen.</p>

      <h2>De situationer hvor du skal gå</h2>
      <p>Nogle ting bør stoppe en handel uanset hvor god prisen er. Batteriet er låst eller mangler oplader. Motoren laver underlige lyde. Sælger nægter at lade dig tage en prøvetur. Prisen ligger 30 procent under markedet (mistanke om tyveri eller skjulte fejl). Eller cyklen har et tredjeparts-batteri i stedet for et originalt, hvilket kan være en reel sikkerhedsrisiko.</p>

      <h2>Hvad betyder en realistisk pris</h2>
      <p>Brug Cykelbørsens <a href="/vurder-min-cykel/" onclick="event.preventDefault();navigateTo('/vurder-min-cykel')">vurderingsværktøj</a> for at se hvad lignende e-cykler sælges for lige nu. En el-cykel taber typisk mest værdi de første år. Sammenlign altid med lignende annoncer. Jo ældre cyklen er, jo tættere er batteriet på udskiftning, og det skal afspejles i prisen.</p>
      <p>På Cykelbørsen kan du filtrere på "El-cykel" som type. Mange forhandlere tilbyder også garanti på brugte e-cykler, og det vises tydeligt med et garanti-mærke på annoncen.</p>
    `,
  },

  'bedre-cykel-billeder': {
    slug: 'bedre-cykel-billeder',
    title: 'Tag bedre cykel-billeder med din mobil',
    excerpt: 'Forskellen mellem en cykel der sælges på to dage og en der ligger i tre måneder ligger ofte i billederne.',
    metaDesc: 'Tag bedre billeder af din cykel inden salg: lys, vinkler, baggrund og opsætning. Komplet guide.',
    category: 'Salg',
    readTime: 4,
    publishedAt: '2026-05-11',
    body: `
      <p>Forskellen mellem en cykel der sælges på to dage til en god pris, og en der ligger og samler støv i tre måneder, ligger ofte i billederne. Det kræver ikke en pro-fotograf at få gode resultater, men der er en håndfuld ting der gør en stor forskel. Det hele kan klares med en moderne mobiltelefon.</p>

      <h2>Dagslys er din ven</h2>
      <p>Tag aldrig billeder i kælderbelysning eller halogen-spots. Det giver gule farver og hårde skygger, og resultatet ligner aldrig cyklen i virkeligheden. Tag billederne udenfor i overskyet vejr i stedet. Skyerne fungerer som naturlig diffuser og fjerner skarpe skygger, så lyset bliver jævnt og smigrende. Den næstbedste mulighed er tidlig morgen eller sen eftermiddag når solen står lavt. Lyset er behageligt varmt uden at brænde ud.</p>

      <h2>Find en ren baggrund</h2>
      <p>Folk vil se cyklen, ikke din parkeringsplads eller en skraldespand. Stil dig et sted med en simpel baggrund som en hvid mur, et trægærde, asfalt eller pæn flisebelægning. Hvis du er i en park, så sørg for at der ikke er rod, biler eller løse personer i baggrunden. En ren baggrund signalerer at sælger har styr på det, og det giver tillid.</p>

      <h2>De vinkler du har brug for</h2>
      <p>Mindst fem vinkler er en god rettesnor. Det vigtigste er hele cyklen fra siden, og det skal være dit forsidebillede. Tag også et billede forfra som viser styr, forgaffel og forbremse, et bagfra med gear og bagbremse, et nærbillede af krank og gear hvor man kan se slid og kvalitet, og et af stelnummeret. Det sidste er ikke kun for køberens skyld. Det bygger tillid, fordi du som sælger viser at du har styr på din cykel.</p>
      <p>Du må gerne tilføje flere billeder. Et af sadlen, et af dækkene, og et af eventuelle ridser eller skader, hvis cyklen har nogen. Vær ærlig omkring slid. Det skaber tillid, og det forhindrer reklamationer efter handlen.</p>

      <h2>Hold mobilen vandret og lavt</h2>
      <p>Den almindeligste amatørfejl er at tage billedet stående med mobilen højt oppe. Resultatet er at cyklen ender lille i bunden af billedet med masser af himmel ovenover. Sæt dig i stedet i knæhøjde og hold mobilen vandret i landskab-orientering. Det fanger hele cyklen som et naturligt øjenhøjde-billede.</p>

      <h2>Fyld rammen ud</h2>
      <p>Cyklen skal fylde 70-80 procent af billedet. Hvis der er for meget tom plads omkring den, virker billedet udvandet. Zoom ind ved at bevæge dig tættere på cyklen, ikke ved at bruge pinch-zoom på mobilen. Pinch-zoom giver dårligere billedkvalitet, mens fysisk afstand bevarer fuld opløsning.</p>

      <h2>Forsidebilledet er kongen</h2>
      <p>Det første billede er det eneste mange købere ser. Det skal vise hele cyklen fra siden, gerne med pedalen i klokken seks-position (lige nedad) og kæden tydelig. Det er den klassiske cykelvinkel som alle genkender, og den får cyklen til at se samlet og helstøbt ud.</p>

      <h2>Gør cyklen klar inden</h2>
      <p>Bare en hurtig overspuling og afpudsning gør en stor forskel. Pust dækkene op til normaltryk, smør kæden så den glinser, og rens bremseklodserne for sort bremsestøv. En ren cykel ser bedre vedligeholdt ud på billederne, og det er dem køberen bedømmer den på.</p>

      <h2>Fejlene du skal undgå</h2>
      <p>Spejlbilleder eller billeder taget i bilvinduer virker amatøragtigt. Selfies med cyklen er heller ikke nogen god idé, fordi folk vil se cyklen, ikke dig. Hold dig fra filtre og overbearbejdning. Ærlige billeder sælger bedst, og overdrevent justerede billeder skaber mistanke. Og hvis flere cykler er med på samme billede, mister læseren fokus på hvad der egentlig er til salg.</p>

      <h2>Et kvarters arbejde, stor effekt</h2>
      <p>Et kvarters arbejde med ordentligt lys, en ren baggrund og fem-otte gode vinkler er noget af det bedste, du kan gøre for din annonce. Når du opretter annoncen på Cykelbørsen, kan du beskære dine billeder direkte til det 3:2-format der vises på annoncekort, så du selv vælger præcis hvilket udsnit køberne ser i feed'et.</p>
    `,
  },

  'saelg-cykel-tips': {
    slug: 'saelg-cykel-tips',
    title: 'Sælg din cykel hurtigt: sådan får du den bedste pris',
    excerpt: 'Pris, billeder, beskrivelse og hurtige svar. Her er det, der gør forskellen på en annonce der sælger, og en der bliver liggende.',
    metaDesc: 'Sælg din cykel hurtigt og dyrt: prissætning, billeder, beskrivelse og forhandling. Komplet salgsguide.',
    category: 'Salg',
    readTime: 5,
    publishedAt: '2026-05-11',
    body: `
      <p>At sælge en cykel hurtigt og til en god pris er ikke et tilfælde. Det er et håndværk man kan lære. Her er det, vi ville gøre, hvis vi skulle sælge en cykel i dag.</p>

      <h2>Begynd med en realistisk pris</h2>
      <p>Den klassiske fejl er at sætte prisen højere end markedet og håbe på det bedste. Resultatet er som regel det modsatte. Annoncen får ikke henvendelser, prisen sættes ned efter et par uger, og slutprisen ender ofte lavere end hvis man var startet realistisk fra begyndelsen.</p>
      <p>Tjek Cykelbørsens <a href="/vurder-min-cykel/" onclick="event.preventDefault();navigateTo('/vurder-min-cykel')">gratis vurderingsværktøj</a> for at se, hvad lignende cykler er sat til salg for. Ligger din pris på niveau med dem, er du med i feltet. Vil du sælge hurtigt, så sæt prisen lidt under: købere der sorterer efter pris, ser dig før de andre.</p>

      <h2>Beskrivelsen skal sælge, ikke bare beskrive</h2>
      <p>Skriv den i en bestemt rækkefølge, så bliver det aldrig forkert. Start med mærke, model, årgang og tilstand i én sætning. Forklar derefter kort hvorfor du sælger. Det er fint at være ærlig, og "jeg cykler ikke nok længere" lyder bedre end generiske floskler om at cyklen er fantastisk.</p>
      <p>Beskriv så de tekniske specifikationer (gear, bremser, hjulstørrelse, vægt), nævn hvad der er nyt eller skiftet (kæde, dæk, bremseklodser), og vær åben omkring eventuelle skavanker. Slut med praktisk info om afhentning, mødested og betalingsform.</p>
      <p>Generelle floskler som "fantastisk cykel, må sælges" virker desperat. Vær konkret. Det skaber tillid og giver køberen følelsen af at du ved hvad du taler om.</p>

      <h2>Tag rigtig gode billeder</h2>
      <p>Fem til otte skarpe billeder giver køberen et langt bedre grundlag end et eller to slørede, og det er ofte dét der afgør, om de skriver til dig. Vi har en separat <a href="/blog/bedre-cykel-billeder/" onclick="event.preventDefault();navigateTo('/blog/bedre-cykel-billeder')">guide til at tage cykelbilleder</a> her på sitet, og det er sandsynligvis den enkelte ting der giver mest tilbage for tiden.</p>

      <h2>Sælg i sæsonen</h2>
      <p>Cykelmarkedet er sæsonbestemt. Foråret og forsommeren (marts til juni) er højsæsonen, hvor flest købere er aktive og priserne er højest. Juli og august er stadig gode, men det er ferieperiode. Fra september begynder markedet at falde, og december til februar er bunden, hvor det mest er købere på udkig efter et godt tilbud.</p>
      <p>Sælger du i marts eller april, er der flest købere. Skal du sælge om vinteren, må du regne med at gå lidt ned i pris for at få et hurtigt salg.</p>

      <h2>Vær hurtig til at svare</h2>
      <p>De fleste henvendelser kommer kort efter at annoncen er oprettet, og en køber der ikke får svar, skriver til den næste sælger. Svar hurtigt, høfligt og konkret. Cykelbørsen sender dig en e-mail, når der kommer en ny besked.</p>

      <h2>Forhandl med en bundgrænse</h2>
      <p>Næsten alle vil byde under din pris. Vær forberedt og lav et indre tal, den laveste pris du kan acceptere. Imødekom rimelige bud (fem-ti procent under) i god ro, men afvis tomme bud som "vil du tage 1500 for en 8000-cykel". Det er ikke forhandling.</p>
      <p>Når en køber skriver et bud under din pris, foreslår Cykelbørsen automatisk et mød-i-midten-bud mellem buddet og din pris, som køberen kan sende med et klik. Det sparer en del beskedudveksling. Har du flere interesserede ad gangen, må du gerne lade dem konkurrere lidt. "Jeg har tre interesserede, og højeste tilbud i morgen aften får cyklen" er en helt fair måde at gøre det på, og det presser priserne op.</p>

      <h2>Genopfrisk efter to uger</h2>
      <p>Hvis cyklen ikke er solgt efter et par uger, så sænk prisen. Købere der har trykket "Få besked ved prisfald" på din annonce, får en e-mail om det. Skift gerne forsidebilledet samtidig. Du kan også tilføje flere specs i titlen ("Trek FX 3 Disc M 2022, carbon, Shimano Tiagra"), så folk der søger på specifikke detaljer også finder annoncen.</p>

    `,
  },

  'racercykler-under-15000': {
    slug: 'racercykler-under-15000',
    title: 'Bedste racercykler under 15.000 kr',
    excerpt: '15.000 kr er en god prisklasse at komme ind i racercykling. Hvad får du for pengene ny, og hvad får du brugt?',
    metaDesc: 'Racercykler under 15.000 kr: Trek Domane, Cube Attain, Specialized Allez og flere. Hvad de er, og hvad du skal tjekke.',
    category: 'Køb',
    readTime: 6,
    publishedAt: '2026-05-11',
    body: `
      <p>15.000 kr er en god prisklasse at komme ind i racercykling. Ny er du på begynder- til mellemniveau hos de store mærker, og brugt får du betydeligt mere for pengene, typisk en premium cykel der er to-tre år gammel. Spørgsmålet er hvad du skal lede efter, og hvilke modeller der reelt giver mest valuta for pengene.</p>

      <h2>Aluminium eller carbon</h2>
      <p>For 15.000 kr har du grundlæggende to muligheder. Du kan købe en ny racercykel med aluminiumsramme og Shimano 105-gear, hvilket er et solidt udgangspunkt for begyndere og motionister. Eller du kan købe en brugt carbon-racer der er to-tre år gammel med samme gear-niveau, men en markant lettere og mere komfortabel ramme.</p>
      <p>Carbon er lettere og dæmper vibrationer bedre, men ny carbon i denne prisklasse er fyldt med kompromisser: tunge rammer, billigere komponenter og billigere hjul. Brugt carbon fra to-tre år tilbage giver dig en cykel der oprindeligt kostede betydeligt mere.</p>

      <h2>Seks modeller værd at kigge på</h2>
      <p><strong>Trek Domane AL</strong> er en endurance-racer med aluminiumsramme og en komfortabel geometri til lange ture. Gruppesæt og bremser varierer fra årgang til årgang, så tjek hvad den konkrete cykel har.</p>
      <p><strong>Cube Attain</strong> er Cubes endurance-racer. GTC-udgaven har carbonramme, de øvrige aluminium. Er den i carbon, så gå rammen efter for revner og skader.</p>
      <p><strong>Specialized Allez</strong> er en race-cykel i aluminium. Mange har været gennem flere hænder, så tjek altid kæde, kassette og krans for slid.</p>
      <p><strong>Canyon Endurace AL</strong> er en endurance-racer i aluminium, som Canyon sælger direkte uden forhandler. Køber du den brugt, så tjek at den er samlet og justeret ordentligt.</p>
      <p><strong>Cannondale Synapse</strong> er Cannondales endurance-cykel og fås i både aluminium og carbon. Tjek hvilket gruppesæt og hvilke bremser den konkrete årgang har.</p>
      <p>Til sidst er der brugt <strong>Cervélo R3 eller Soloist</strong>: race-cykler med carbonramme. Gå rammen grundigt efter for revner og styrtskader, og spørg til historikken.</p>

      <h2>Det du skal holde dig fra</h2>
      <p>Friction-shifters er teknologi fra 80'erne, og du vil have indexed shifting med klik. Fælgbremser uden hydraulik er OK på racere, men skivebremser bremser bedre i vådt vejr. Pas på 26-tommer hjul, da det er gamle MTB-hjul, ikke moderne racerstandard, hvor 28-tommer (700c) er normen. Og hvis mærket er et navn du aldrig har hørt om, så er reservedele ofte umulige at finde senere.</p>

      <h2>Brugt eller ny</h2>
      <p>Det er det evige spørgsmål. Ny giver dig garanti, en service-aftale med en forhandler, og du kan vælge præcis den størrelse og farve du vil have. Det er den rigtige løsning hvis du er helt ny til racing og vil have tryghed.</p>
      <p>Brugt giver dig betydeligt mere cykel for pengene, men kræver at du kan tjekke en cykel selv, eller har en ven der kan. Det kræver også at du er villig til at vente på den rigtige model i den rigtige størrelse. Forskellen i pris er stor nok til at det næsten altid er værd at lære at tjekke en brugt racer ordentligt igennem.</p>

      <h2>Husk udstyret</h2>
      <p>15.000 kr på en cykel er kun en del af regningen. Du har også brug for en cykelhjelm (800-2.500 kr), cykelsko og clipless pedaler (1.500-4.000 kr), cykeltøj med polstrede shorts og trøje (1.500-3.000 kr), og almindeligt tilbehør som lås, lygter og flaskeholder (1.000-3.000 kr). Et realistisk totalbudget for at komme i gang ligger på 18-23.000 kr.</p>
      <p>På Cykelbørsen kan du filtrere på "Racercykel" under cykeltyper og sætte din ønskede prisinterval for at se hvad der er tilgængeligt lige nu.</p>
    `,
  },
};

export function getAllArticlesSorted() {
  return Object.values(BLOG_ARTICLES).sort((a, b) =>
    new Date(b.publishedAt) - new Date(a.publishedAt)
  );
}

export function getArticleBySlug(slug) {
  return BLOG_ARTICLES[slug] || null;
}
