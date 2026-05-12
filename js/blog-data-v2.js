/* ============================================================
   BLOG-INDHOLD
   Hver artikel har slug, title, excerpt, metaDesc, category,
   readTime, publishedAt, heroEmoji og body (HTML).
   ============================================================ */

export const BLOG_ARTICLES = {
  'undgaa-stjaalet-cykel': {
    slug: 'undgaa-stjaalet-cykel',
    title: 'Sådan undgår du at købe en stjålet cykel',
    excerpt: 'Forestil dig at du lige har købt en velholdt brugt cykel, og en uge senere ringer politiet. Sådan undgår du den situation.',
    metaDesc: 'Sådan undgår du at købe en stjålet cykel: stelnummer-tjek, røde flag og dokumentation. Komplet guide fra Cykelbørsen.',
    category: 'Sikkerhed',
    readTime: 4,
    publishedAt: '2026-11-08',
    heroEmoji: '🛡️',
    body: `
      <p>Forestil dig at du lige har købt en velholdt brugt cykel for 8.000 kr, og en uge senere ringer politiet. Cyklen var stjålet. Du står både uden cykel og uden penge. Den situation kan man stort set altid undgå med fem minutters opmærksomhed inden hver handel, og det er en lille investering i forhold til hvad en brugt cykel typisk koster.</p>

      <h2>Stelnummeret er udgangspunktet</h2>
      <p>Cyklens stelnummer fungerer som en bils registreringsnummer. Det står typisk på rammen under bundbeslaget mellem pedalerne, men kan også sidde på sadelpinden eller styrhovedet. Det vigtigste er at bede om det inden I overhovedet mødes.</p>
      <p>Send sælger en kort besked på forhånd. Et eksempel kunne være: "Hej, må jeg lige få stelnummeret før vi ses? Jeg vil bare slå det op hos politiet for at handle med god samvittighed." En reel sælger har ikke noget imod det. Hvis personen nægter, finder undskyldninger eller pludselig siger at nummeret er slidt af, så drop handlen. Det er det største advarselstegn der findes.</p>

      <h2>Slå nummeret op hos politiet</h2>
      <p>Politiet har et offentligt register over cykler der er meldt stjålne, og du kan slå et stelnummer op på under et minut på <a href="https://politi.dk/cykler-og-koeretoejer/tjek-om-en-cykel-eller-et-koeretoej-er-efterlyst/tjek-om-en-cykel-er-efterlyst" target="_blank" rel="noopener">politi.dk</a>.</p>
      <p>Hvis cyklen står som efterlyst, dukker den op her. Et blankt resultat betyder ikke automatisk at cyklen er ren, fordi registret kun indeholder de cykler ejerne selv har meldt stjålet. Men det er det første og vigtigste tjek man kan lave inden man betaler.</p>

      <h2>Prisen siger ofte en hel del</h2>
      <p>Slå normalprisen for modellen op, gerne i Cykelbørsens <a href="/vurder-min-cykel" onclick="event.preventDefault();navigateTo('/vurder-min-cykel')">vurderingsværktøj</a>. Ligger prisen 30 procent under markedet, så stil dig selv spørgsmålet hvorfor.</p>
      <p>Sælger har måske en troværdig forklaring. Familien flytter, der er pludseligt brug for kontanter, eller cyklen skal bare væk hurtigt. Det er klart situationer der findes i virkeligheden. Men det er også de klassiske svindelhistorier, så vær særligt på vagt hvis cyklen samtidig fremstår uden et eneste brugsspor selvom prisen er meget lav.</p>

      <h2>Spørg til historikken</h2>
      <p>En reel ejer kan typisk fremvise enten den originale kvittering, en servicehistorik fra en forhandler, billeder af registreringen hos sit forsikringsselskab, eller den tidligere annonce på Cykelbørsen hvis cyklen er købt brugt. Det er ikke ensbetydende med at en sælger uden papirer har stjålet cyklen, da mange privatpersoner smider kvitteringer ud over årene. Men kombineret med andre advarselstegn er det værd at tøve.</p>

      <h2>Mødested og kvittering</h2>
      <p>Insistér på at mødes et offentligt sted, fx foran en cykelhandler, en politistation eller en cafe. Tag billeder af cyklen og stelnummeret før du betaler. Hvis sælger nægter at mødes offentligt eller virker nervøs ved kameraet, så er det også et signal du skal lytte til.</p>
      <p>Ved handler over 5.000 kr er det værd at lave et simpelt overdragelsesbevis. Det behøver ikke være kompliceret. Sælgers navn, dato, pris, stelnummer og begge parters underskrift på et stykke papir er nok. Send hinanden gerne en kopi pr. mail bagefter, så I begge har dokumentation.</p>

      <h2>Hvis det alligevel går galt</h2>
      <p>Skulle det vise sig, at cyklen var stjålet, så aflevér den til politiet med det samme. Du må ikke beholde stjålne genstande, heller ikke selvom du købte i god tro. Anmeld sælger med den dokumentation du har, kontakt din bank for at høre om chargeback (det er muligt op til 30 dage hvis du betalte med kort eller MobilePay), og overvej at rejse et civilretligt krav.</p>
      <p>I praksis er det dog ofte svært at få pengene tilbage hvis sælger forsvinder eller har brugt falsk identitet. Derfor er forebyggelsen langt vigtigere end alt det man kan gøre bagefter.</p>

      <h2>Det tager ti minutter</h2>
      <p>De fem tjek tager samlet omkring ti minutter at gennemføre, og de fjerner langt størstedelen af risikoen. Det er en lille investering i en handel der typisk koster mellem 5.000 og 20.000 kr. Vil du gå dybere i sikker handel, finder du vores fulde <a href="/sikkerhedsguide" onclick="event.preventDefault();navigateTo('/sikkerhedsguide')">sikkerhedsguide</a> her på sitet.</p>
    `,
  },

  'cykelstoerrelse-guide': {
    slug: 'cykelstoerrelse-guide',
    title: 'Hvilken cykelstørrelse passer mig?',
    excerpt: 'Højde er kun udgangspunktet. Sådan finder du den rigtige stelstørrelse uanset cykeltype.',
    metaDesc: 'Find den rigtige cykelstørrelse: tabel over højde og stelstørrelse for racer, MTB, citybike. Plus måleguide og prøvetur-tips.',
    category: 'Guides',
    readTime: 6,
    publishedAt: '2026-11-05',
    heroEmoji: '📏',
    body: `
      <p>At købe en cykel der ikke passer er en af de hyppigste måder at spilde penge på. Den ender enten i kælderen eller bliver solgt videre med tab efter et par måneder. Heldigvis er det ikke så svært at ramme den rigtige størrelse, hvis man forstår de tre faktorer der spiller ind: højde, benlængde og cykeltype.</p>

      <h2>Højde er kun udgangspunktet</h2>
      <p>Højden er det første mange tænker på, og den er et fint sted at begynde. Problemet er, at den ikke fortæller hele historien. To personer på 175 cm kan sagtens have ti centimeters forskel i benlængde, og det betyder ofte at den ene skal have S mens den anden skal have M. Vælger man udelukkende efter højde, rammer omkring en tredjedel forkert. Derfor er det værd at måle sin benlængde også. Det tager et minut.</p>

      <h2>Sådan måler du din benlængde</h2>
      <p>Tag skoene af og stil dig med ryggen mod en væg. Sæt en bog mellem benene, så den støder op til skridtet omtrent som en sadel ville gøre. Mål så fra toppen af bogen og ned til gulvet. Tallet du får er din benlængde eller "inseam", og det er det vigtigste mål når du skal vælge cykelstørrelse.</p>

      <h2>Stelstørrelse efter højde for racercykler</h2>
      <p>Som vejledende udgangspunkt passer 148-162 cm til en XS-ramme på 44-48 cm, mens 163-170 cm hører til en S på 49-52 cm. Er du 171-178 cm skal du typisk have en M på 53-56 cm, 179-188 cm passer til en L på 57-60 cm, og er du over 189 cm har du brug for en XL på 61 cm eller derover.</p>
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
    publishedAt: '2026-11-02',
    heroEmoji: '⚡',
    body: `
      <p>Brugte el-cykler kan være en rigtig god handel. Du sparer typisk mellem 30 og 50 procent i forhold til ny pris. Men en e-cykel har flere kritiske komponenter end en almindelig cykel — batteri, motor, controller og display — og hver af dem kan koste fem til femten tusind kroner at udskifte. Det er derfor det er værd at bruge et kvarter på at tjekke en brugt e-cykel grundigt igennem inden du betaler.</p>

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
      <p>Brug Cykelbørsens <a href="/vurder-min-cykel" onclick="event.preventDefault();navigateTo('/vurder-min-cykel')">vurderingsværktøj</a> for at se hvad lignende e-cykler sælges for lige nu. Som tommelfingerregel taber en e-cykel 20-30 procent af nyprisen det første år. Efter to år ligger den typisk på 55-65 procent af nyprisen, efter tre-fire år på 40-50 procent, og er den fem år eller mere bør prisen ligge mellem 30 og 40 procent af original. På det tidspunkt nærmer batteriet sig udskiftning, og det skal afspejles i prisen.</p>
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
    publishedAt: '2026-10-28',
    heroEmoji: '📸',
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
      <p>Bare en hurtig overspuling og afpudsning gør en stor forskel. Pust dækkene op til normaltryk, smør kæden så den glinser, og rens bremseklodserne for sort bremsestøv. Et halvt times rengøring kan hæve salgsprisen med 5-10 procent og forkorte salgstiden mærkbart. Det er sandsynligvis den bedste timeløn du kan få på dit cykelsalg.</p>

      <h2>Fejlene du skal undgå</h2>
      <p>Spejlbilleder eller billeder taget i bilvinduer virker amatøragtigt. Selfies med cyklen er heller ikke nogen god idé, fordi folk vil se cyklen, ikke dig. Hold dig fra filtre og overbearbejdning. Ærlige billeder sælger bedst, og overdrevent justerede billeder skaber mistanke. Og hvis flere cykler er med på samme billede, mister læseren fokus på hvad der egentlig er til salg.</p>

      <h2>Et kvarters arbejde, stor effekt</h2>
      <p>Et kvarters arbejde med ordentligt lys, en ren baggrund og fem-otte gode vinkler giver typisk 40 procent hurtigere salg og 5-10 procent højere pris. Det er svært at finde en bedre afkast på din tid. Når du opretter annoncen på Cykelbørsen, kan du beskære dine billeder direkte til det 3:2-format der vises på annoncekort, så du selv vælger præcis hvilket udsnit køberne ser i feed'et.</p>
    `,
  },

  'saelg-cykel-tips': {
    slug: 'saelg-cykel-tips',
    title: 'Sælg din cykel hurtigt: sådan får du den bedste pris',
    excerpt: 'En god annonce kan sælge en cykel på 24 timer. En dårlig kan tage tre måneder. Her er forskellen.',
    metaDesc: 'Sælg din cykel hurtigt og dyrt: prissætning, billeder, beskrivelse og forhandling. Komplet salgsguide.',
    category: 'Salg',
    readTime: 5,
    publishedAt: '2026-10-25',
    heroEmoji: '💰',
    body: `
      <p>At sælge en cykel hurtigt og til en god pris er ikke et tilfælde. Det er et håndværk man kan lære på en halv time. Her er det jeg ville gøre hvis jeg skulle sælge en cykel i dag.</p>

      <h2>Begynd med en realistisk pris</h2>
      <p>Den klassiske fejl er at sætte prisen højere end markedet og håbe på det bedste. Resultatet er som regel det modsatte. Annoncen får ikke henvendelser, prisen sættes ned efter et par uger, og slutprisen ender ofte lavere end hvis man var startet realistisk fra begyndelsen.</p>
      <p>Tjek Cykelbørsens <a href="/vurder-min-cykel" onclick="event.preventDefault();navigateTo('/vurder-min-cykel')">gratis vurderingsværktøj</a> for at se hvad lignende cykler faktisk er solgt for. Rammer du medianen, sælger du typisk inden for en uge eller to. Vil du sælge ekstra hurtigt, så sæt prisen fem procent under median. Det giver dig forrang i søgninger og bud kommer hurtigere ind.</p>

      <h2>Beskrivelsen skal sælge, ikke bare beskrive</h2>
      <p>Skriv den i en bestemt rækkefølge, så bliver det aldrig forkert. Start med mærke, model, årgang og tilstand i én sætning. Forklar derefter kort hvorfor du sælger. Det er fint at være ærlig, og "jeg cykler ikke nok længere" lyder bedre end generiske floskler om at cyklen er fantastisk.</p>
      <p>Beskriv så de tekniske specifikationer (gear, bremser, hjulstørrelse, vægt), nævn hvad der er nyt eller skiftet (kæde, dæk, bremseklodser), og vær åben omkring eventuelle skavanker. Slut med praktisk info om afhentning, mødested og betalingsform.</p>
      <p>Generelle floskler som "fantastisk cykel, må sælges" virker desperat. Vær konkret. Det skaber tillid og giver køberen følelsen af at du ved hvad du taler om.</p>

      <h2>Tag rigtig gode billeder</h2>
      <p>Annoncer med fem til otte skarpe billeder sælger tre gange så hurtigt som dem med et eller to slørede. Vi har en separat <a href="/blog/bedre-cykel-billeder" onclick="event.preventDefault();navigateTo('/blog/bedre-cykel-billeder')">guide til at tage cykelbilleder</a> her på sitet, og det er sandsynligvis den enkelte ting der giver mest tilbage for tiden.</p>

      <h2>Sælg i sæsonen</h2>
      <p>Cykelmarkedet er sæsonbestemt. Foråret og forsommeren (marts til juni) er peak-perioden hvor flest købere er aktive og priserne er højest. Juli og august er stadig gode, men det er ferieperiode. Fra september begynder markedet at falde, og december til februar er bunden hvor kun deal-jægere bevæger sig.</p>
      <p>Sælger du i marts eller april, får du typisk den bedste pris. Skal du sælge om vinteren, må du regne med at gå 10-15 procent under median for at få et hurtigt salg.</p>

      <h2>Vær hurtig til at svare</h2>
      <p>De første henvendelser kommer typisk inden for seks timer efter annoncen er oprettet. Svarer du inden for en time, har du omkring 80 procents chance for at sælge. Venter du til næste dag, falder den til omkring 30 procent. Slå notifikationer til i Cykelbørsen så du får besked når der kommer nye beskeder, og svar høfligt og konkret.</p>

      <h2>Forhandl med en bundgrænse</h2>
      <p>Næsten alle vil byde under din pris. Vær forberedt og lav et indre tal, den laveste pris du kan acceptere. Imødekom rimelige bud (fem-ti procent under) i god ro, men afvis tomme bud som "vil du tage 1500 for en 8000-cykel". Det er ikke forhandling.</p>
      <p>Cykelbørsen viser automatisk et mød-i-midten-bud du kan acceptere med et klik, hvilket sparer en masse beskedudveksling. Har du flere interesserede ad gangen, må du gerne lade dem konkurrere lidt. "Jeg har tre interesserede — højeste tilbud i morgen aften får cyklen" er en helt fair måde at gøre det på, og det presser priserne op.</p>

      <h2>Genopfrisk efter to uger</h2>
      <p>Hvis cyklen ikke er solgt efter et par uger, så sænk prisen med fem-ti procent. Det giver fornyet synlighed i feed'et. Skift gerne forsidebilledet samtidig, så nye billeder genaktiverer interessen som om annoncen er ny. Du kan også tilføje flere specs i titlen ("Trek FX 3 Disc M 2022 — Carbon, Shimano Tiagra"), så folk der søger på specifikke detaljer også finder annoncen.</p>

      <h2>To timer, stor forskel</h2>
      <p>De seks ting tager samlet omkring to timer at gennemføre. Det er typisk forskellen mellem at sælge på tre dage til 90 procent af din ønskepris, eller at sælge på seks uger til 70. Det er en rigtig god timeløn på en eftermiddag du alligevel skulle bruge på cyklen. Husk at Cykelbørsen er gratis for private sælgere, så der er ingen oprettelsesgebyrer eller provision når handlen lukker.</p>
    `,
  },

  'racercykler-under-15000': {
    slug: 'racercykler-under-15000',
    title: 'Bedste racercykler under 15.000 kr',
    excerpt: '15.000 kr er en god prisklasse at komme ind i racercykling. Hvad får du for pengene ny — og hvad får du brugt?',
    metaDesc: 'Bedste racercykler under 15.000 kr: Trek Domane, Cube Attain, Specialized Allez og flere. Komparativ guide.',
    category: 'Køb',
    readTime: 6,
    publishedAt: '2026-10-20',
    heroEmoji: '🚴',
    body: `
      <p>15.000 kr er en god prisklasse at komme ind i racercykling. Ny er du på entry-til-mid niveau hos de store mærker, og brugt får du betydeligt mere for pengene, typisk en premium cykel der er to-tre år gammel. Spørgsmålet er hvad du skal lede efter, og hvilke modeller der reelt giver mest valuta for pengene.</p>

      <h2>Aluminium eller carbon</h2>
      <p>For 15.000 kr har du grundlæggende to muligheder. Du kan købe en ny racercykel med aluminiumsramme og Shimano 105-gear, hvilket er et solidt udgangspunkt for begyndere og motionister. Eller du kan købe en brugt carbon-racer der er to-tre år gammel med samme gear-niveau, men en markant lettere og mere komfortabel ramme.</p>
      <p>Carbon er lettere og dæmper vibrationer bedre, men ny carbon i denne prisklasse er fyldt med kompromisser: tunge rammer, billigere komponenter og billigere hjul. Brugt carbon fra to-tre år tilbage giver dig en cykel der oprindeligt kostede 25-35.000 kr nyt, til halv pris.</p>

      <h2>Seks modeller værd at kigge på</h2>
      <p><strong>Trek Domane AL 4</strong> er et godt udgangspunkt. En ny koster omkring 12.000 kr, og brugt finder du den typisk for 7-9.000 kr. Det er en endurance-racer med aluminiumsramme, carbon-forgaffel, Shimano Tiagra-gear og hydrauliske skivebremser. Geometrien er komfortabel og velegnet til lange ture, og Treks IsoSpeed-system dæmper vibrationer mærkbart.</p>
      <p><strong>Cube Attain GTC</strong> er det tyske alternativ, omtrent samme prisniveau ny (14.000 kr) eller 9-12.000 kr brugt. Den giver dig en carbonramme og Shimano 105-gear til en aggressiv pris, og geometrien er mere race-orienteret end Domanes.</p>
      <p><strong>Specialized Allez</strong> er en klassiker. Aluminium med carbon-forgaffel, Shimano-gear, og opbygget til at være hurtig og responsiv. Ny koster den omkring 10.000 kr, brugt får du den for 5-8.000 kr. Mange Allez har været gennem flere hænder, så tjek altid kæde, kassette og krans for slid.</p>
      <p><strong>Canyon Endurace AL</strong> er Canyons direct-to-consumer-bud. Du sparer mellemleddet ved at købe direkte fra Canyon, så prisen er aggressiv (omkring 12.000 kr for AL-modellen). Bemærk at den kommer i flat pack og kræver lidt egen samling, men det er overskueligt med en cykelnøgle og en time.</p>
      <p><strong>Cannondale Synapse AL</strong> er Cannondales endurance-cykel. Aluminium med SAVE-vibrationsdæmpning og Shimano 105 eller Tiagra. Ny ligger den på 13.000 kr, og brugt typisk 7-10.000 kr. God til granfondoer og lange søndagsture, mindre velegnet til ren racekørsel.</p>
      <p>Til sidst er der brugt <strong>Cervélo R3 eller Soloist</strong>. En model fra 2017-2019 kan ligge på 12-15.000 kr brugt, og du får en World Tour-niveau carbon-ramme med Shimano Ultegra eller højere komponenter. Det er performance-cyklen i denne prisklasse hvis du jagter brugt premium.</p>

      <h2>Det du skal holde dig fra</h2>
      <p>Friction-shifters er teknologi fra 80'erne, og du vil have indexed shifting med klik. Fælgbremser uden hydraulik er OK på racere, men skivebremser holder bedre på langs i alle vejrforhold. Pas på 26-tommer hjul, da det er gamle MTB-hjul, ikke moderne racerstandard, hvor 28-tommer (700c) er normen. Og hvis mærket er et navn du aldrig har hørt om, så er reservedele ofte umulige at finde senere.</p>

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
