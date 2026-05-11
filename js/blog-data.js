/* ============================================================
   BLOG-INDHOLD
   Indeholder alle artikler. Hver artikel har:
   - slug      (URL-del: /blog/:slug)
   - title     (H1 + meta-title)
   - excerpt   (vises i overview-kortet)
   - metaDesc  (SEO description)
   - category  (Køb / Salg / Sikkerhed / Guides)
   - readTime  (estimat i minutter)
   - publishedAt (ISO-dato)
   - heroEmoji (visuel marker i overview/hero)
   - body      (HTML-streng — Fraunces til h2, DM Sans til brødtekst)
   ============================================================ */

export const BLOG_ARTICLES = {
  'undgaa-stjaalet-cykel': {
    slug: 'undgaa-stjaalet-cykel',
    title: 'Sådan undgår du at købe en stjålet cykel',
    excerpt: 'Hvert år bliver tusindvis af cykler genere solgt videre. 5 konkrete tjek der afslører stjålne cykler — selv hvis sælger virker pålidelig.',
    metaDesc: 'Sådan undgår du at købe en stjålet cykel: stelnummer-tjek, røde flag og dokumentation. Komplet guide fra Cykelbørsen.',
    category: 'Sikkerhed',
    readTime: 4,
    publishedAt: '2026-11-08',
    heroEmoji: '🛡️',
    body: `
      <p>Det er din værste mareridtsscenarie: du har lige købt en brugt cykel for 8.000 kr — og politiet ringer en uge senere fordi cyklen var stjålet. Du står både uden cykel OG uden penge. Heldigvis kan du undgå det med 5 minutters arbejde inden hver handel.</p>

      <h2>1. Bed altid om stelnummeret inden mødet</h2>
      <p>Stelnummeret er cyklens "VIN-nummer". Det står normalt:</p>
      <ul>
        <li>Under bundbeslaget (mellem pedalerne)</li>
        <li>På bagstellet eller sadelpinden</li>
        <li>På styrhovedet</li>
      </ul>
      <p>Send sælger en venlig besked: <em>"Hej! Inden vi mødes — kan du sende mig stelnummeret? Jeg vil bare lige tjekke det mod politiets register, så jeg kan handle med god samvittighed."</em></p>
      <p>Hvis sælger nægter, har travlt, eller siger stelnummeret er slidt væk → <strong>gå væk fra handlen</strong>. Det er det største advarselstegn der findes.</p>

      <h2>2. Tjek stelnummeret mod politiets register</h2>
      <p>Politiet har et <strong>gratis offentligt register</strong> over efterlyste cykler. Det tager 10 sekunder at slå et stelnummer op:</p>
      <p><a href="https://politi.dk/cykler-og-koeretoejer/tjek-om-en-cykel-eller-et-koeretoej-er-efterlyst/tjek-om-en-cykel-er-efterlyst" target="_blank" rel="noopener">→ Åbn politiets register</a></p>
      <p>Hvis cyklen er meldt stjålet, dukker den op her. Bemærk: registret indeholder kun cykler som ejeren har meldt stjålet — så et "tomt" resultat betyder ikke 100% at cyklen er ren, men det er det første og vigtigste tjek.</p>

      <h2>3. Vær mistænksom over for "for billig"</h2>
      <p>Tjek normalprisen for cyklens model. Brug Cykelbørsens <a href="/vurder-min-cykel" onclick="event.preventDefault();navigateTo('/vurder-min-cykel')">vurderingsværktøj</a> til at sammenligne. Hvis prisen er <strong>30% under markedet</strong> — spørg dig selv hvorfor.</p>
      <p>Sælger vil måske sige "den skal bare væk hurtigt" eller "har brug for kontanter til regninger". Det kan være sandt — men det er også klassiske svindelhistorier. Vær særligt mistænksom hvis cyklen tilmed er ridsefri men sælges meget billigt.</p>

      <h2>4. Bed om købsbevis eller historik</h2>
      <p>En reel ejer kan typisk fremvise:</p>
      <ul>
        <li>Original kvittering eller faktura</li>
        <li>Service-historik fra en forhandler</li>
        <li>Billede af registrering hos egen forsikring</li>
        <li>Forrige Cykelbørsen-annonce hvis cyklen er købt brugt</li>
      </ul>
      <p>Manglende historik er ikke automatisk et tegn på tyveri — mange privatpersoner kasserer kvitteringer. Men kombineret med andre advarselstegn er det værd at overveje.</p>

      <h2>5. Mød offentligt og dokumentér</h2>
      <p>Insistér på et offentligt mødested — foran en cykelhandler, politistation eller cafe. Tag billeder af cyklen + stelnummeret <strong>før</strong> du betaler. Hvis sælger ikke vil mødes offentligt, eller virker nervøs ved kameraet, så gå.</p>
      <p>Ved køb over 5.000 kr: lav et simpelt overdragelsesbevis. Det behøver ikke være kompliceret — bare sælgers navn, dato, pris, stelnummer og underskrift. Skriv det med pen på et stykke papir, eller send det til hinanden på mail.</p>

      <h2>Hvad gør du hvis du har købt en stjålet cykel?</h2>
      <p>Hvis det viser sig at cyklen er stjålet:</p>
      <ol>
        <li><strong>Aflevér cyklen til politiet</strong> — du må ikke beholde stjålne genstande</li>
        <li><strong>Anmeld sælger</strong> — du har dokumentation (overdragelsesbevis, beskeder, billeder)</li>
        <li><strong>Kontakt din bank</strong> — chargeback er muligt op til 30 dage hvis du har betalt med kort/MobilePay</li>
        <li><strong>Erstatningskrav</strong> — du kan civilretsligt kræve pengene tilbage fra sælger</li>
      </ol>
      <p>I praksis er det svært at få penge tilbage hvis sælger forsvinder. Derfor er <strong>forebyggelse</strong> langt vigtigere end at reparere bagefter.</p>

      <h2>Konklusion</h2>
      <p>De 5 tjek tager samlet 10 minutter, og de eliminerer ~95% af risikoen for at købe en stjålet cykel. Det er små minutter at investere i en handel der ofte koster 5.000–20.000 kr.</p>
      <p>Læs også vores fulde <a href="/sikkerhedsguide" onclick="event.preventDefault();navigateTo('/sikkerhedsguide')">sikkerhedsguide</a> for flere tips til at handle trygt på Cykelbørsen.</p>
    `,
  },

  'cykelstoerrelse-guide': {
    slug: 'cykelstoerrelse-guide',
    title: 'Hvilken cykelstørrelse passer mig? Komplet guide',
    excerpt: 'Højde, benlængde og cykeltype — alt påvirker hvilken stelstørrelse du skal vælge. Med konkrete eksempler og målinger der virker.',
    metaDesc: 'Find den rigtige cykelstørrelse: tabel over højde og stelstørrelse for racer, MTB, citybike. Plus måleguide og prøvetur-tips.',
    category: 'Guides',
    readTime: 6,
    publishedAt: '2026-11-05',
    heroEmoji: '📏',
    body: `
      <p>Den rigtige cykelstørrelse er forskellen mellem en cykel du elsker at køre på, og en cykel der ender i kælderen. Desværre er størrelsesvalget ikke så simpelt som "jeg er 175 cm, jeg skal have en M". Her er hvad du faktisk skal vide.</p>

      <h2>De tre faktorer der bestemmer din størrelse</h2>
      <ol>
        <li><strong>Højde</strong> — vigtigst, men ikke det eneste</li>
        <li><strong>Benlængde (inseam)</strong> — afgør sadelhøjde</li>
        <li><strong>Cykeltype</strong> — racer kræver mere strakt position end citybike</li>
      </ol>
      <p>Hvis du kun går efter højde, vil 30% af alle ryttere få en cykel der ikke passer. Mål din benlængde — det tager 1 minut.</p>

      <h2>Sådan måler du din benlængde (inseam)</h2>
      <p>Du skal måle <strong>fra skridtet til gulvet</strong>:</p>
      <ol>
        <li>Tag sko af og stå med ryggen mod en væg</li>
        <li>Sæt en bog mellem benene, så den støder op til skridtet (som en sadel ville gøre)</li>
        <li>Mål fra toppen af bogen til gulvet</li>
        <li>Det er din benlængde</li>
      </ol>
      <p>For en person på 175 cm højde varierer benlængden typisk fra 78 cm til 86 cm — det er en variation på 8 cm der betyder forskellige stelstørrelser.</p>

      <h2>Cykelstørrelse efter højde — racercykler</h2>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead>
          <tr style="background:var(--sand);">
            <th style="padding:10px;text-align:left;border:1px solid var(--border);">Højde</th>
            <th style="padding:10px;text-align:left;border:1px solid var(--border);">Stelstørrelse</th>
            <th style="padding:10px;text-align:left;border:1px solid var(--border);">Typisk cm</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:8px;border:1px solid var(--border);">148–162 cm</td><td style="padding:8px;border:1px solid var(--border);">XS</td><td style="padding:8px;border:1px solid var(--border);">44–48 cm</td></tr>
          <tr><td style="padding:8px;border:1px solid var(--border);">163–170 cm</td><td style="padding:8px;border:1px solid var(--border);">S</td><td style="padding:8px;border:1px solid var(--border);">49–52 cm</td></tr>
          <tr><td style="padding:8px;border:1px solid var(--border);">171–178 cm</td><td style="padding:8px;border:1px solid var(--border);">M</td><td style="padding:8px;border:1px solid var(--border);">53–56 cm</td></tr>
          <tr><td style="padding:8px;border:1px solid var(--border);">179–188 cm</td><td style="padding:8px;border:1px solid var(--border);">L</td><td style="padding:8px;border:1px solid var(--border);">57–60 cm</td></tr>
          <tr><td style="padding:8px;border:1px solid var(--border);">189+ cm</td><td style="padding:8px;border:1px solid var(--border);">XL</td><td style="padding:8px;border:1px solid var(--border);">61+ cm</td></tr>
        </tbody>
      </table>

      <h2>Mountainbike er anderledes</h2>
      <p>MTB-størrelser er typisk angivet i tommer (16", 17", 19" osv.) eller bogstaver (S/M/L). De er normalt 2-3 cm mindre end racer-rammer for samme højde — du sidder mere oprejst og har brug for mere benplads over rammen ved off-road.</p>

      <h2>Citybike — komfort først</h2>
      <p>Citybikes har typisk en mere oprejst position, så du kan slippe afsted med en lidt mindre ramme end på en racer. Det vigtigste er at du kan sætte begge fødder fast på jorden ved stop. Test altid før du køber.</p>

      <h2>Den vigtigste test: prøvetur</h2>
      <p>Når du har fundet en cykel der "passer på papiret", så lav en hurtig prøvetur. Tjek:</p>
      <ul>
        <li><strong>Standhøjde:</strong> begge fødder skal være flade på jorden når du sidder af</li>
        <li><strong>Sadel-rækkevidde:</strong> i bunden af pedalcyklus skal benet være næsten strakt (~5° bøjet)</li>
        <li><strong>Rækkevidde til styr:</strong> du skal hverken være presset sammen eller overstrakt</li>
        <li><strong>Komfort efter 5 min:</strong> hvis ryggen, knæene eller håndleddene gør ondt allerede, så er størrelsen forkert</li>
      </ul>

      <h2>Hvad hvis jeg er mellem to størrelser?</h2>
      <p>Hvis du fx er 178 cm — på grænsen mellem M og L:</p>
      <ul>
        <li><strong>Vælg S/M</strong> hvis: du er korte ben + lang overkrop, kører primært by, foretrækker oprejst position</li>
        <li><strong>Vælg M/L</strong> hvis: du er lange ben + kort overkrop, kører primært race, foretrækker strakt position</li>
      </ul>
      <p>En lille ramme kan altid "vokse" lidt med en længere sadelpind. En stor ramme kan ikke krympes.</p>

      <h2>Mærkeforskelle</h2>
      <p>Trek, Cube, Specialized og andre store mærker har lidt forskellige geometrier. En "M" Trek og en "M" Specialized er ikke nødvendigvis identiske. Tjek altid producentens egen størrelsesguide for den specifikke model.</p>

      <h2>Konklusion</h2>
      <p>Brug højde-tabellen som udgangspunkt, mål benlængden hvis du er i tvivl, og lav <strong>altid en prøvetur</strong>. En 5-minutters prøvetur sparer dig for 5 års kælderparkering af en cykel der ikke passer.</p>
      <p>På Cykelbørsen kan du filtrere annoncer efter stelstørrelse, så du kun ser cykler der passer dig. Brug filteret i venstre side.</p>
    `,
  },

  'koeb-brugt-el-cykel': {
    slug: 'koeb-brugt-el-cykel',
    title: 'Køb brugt el-cykel: 7 ting du skal tjekke',
    excerpt: 'El-cykler er det hurtigst voksende segment — også på brugtmarkedet. Sådan undgår du at købe en der er ved at miste batteriet.',
    metaDesc: 'Køb brugt el-cykel sikkert: tjek batteri, motor, hjul og bremser. Spørgsmål du skal stille sælger. Komplet guide.',
    category: 'Køb',
    readTime: 5,
    publishedAt: '2026-11-02',
    heroEmoji: '⚡',
    body: `
      <p>Brugte el-cykler er populære — du kan typisk spare 30-50% i forhold til ny pris. Men en e-cykel har flere kritiske komponenter end en almindelig cykel: batteri, motor, controller, display. Hver kan koste 5.000-15.000 kr at udskifte. Her er hvad du SKAL tjekke.</p>

      <h2>1. Batteriets sundhed (vigtigst!)</h2>
      <p>Batteriet er den dyreste enkeltdel og den der slides hurtigst. Et nyt batteri koster typisk 4.000-8.000 kr — så hvis det er udslidt, er hele besparelsen tabt.</p>
      <p><strong>Spørg sælger:</strong></p>
      <ul>
        <li>Hvor mange km har cyklen kørt? (typisk slidgrænse: 15.000-25.000 km)</li>
        <li>Hvor mange ladninger har batteriet (cykler med Bosch/Yamaha viser det i displayet)</li>
        <li>Hvor langt kører cyklen på fuld opladning <strong>nu</strong> sammenlignet med da den var ny?</li>
      </ul>
      <p>Hvis rækkevidden er faldet under 60% af original, er batteriet på vej ud. Tag en prøvetur — en sund e-cykel skal trække dig op ad en bakke uden vanvittige problemer.</p>

      <h2>2. Motoren — lyt og mærk</h2>
      <p>Motorer fra Bosch, Shimano, Yamaha og Brose holder typisk 30.000-50.000 km hvis de er passet rigtigt. Lyt efter:</p>
      <ul>
        <li><strong>Ingen knirken</strong> ved pedaltryk</li>
        <li><strong>Jævn assistance</strong> — assistansen skal komme glat, ikke i ryk</li>
        <li><strong>Ingen overophedning</strong> — motoren må gerne være varm efter brug, men ikke brændende</li>
      </ul>
      <p>Hvis motoren laver klikkende lyde eller assistansen falder ud kortvarigt — gå væk. En motorreparation kan koste 10.000 kr+.</p>

      <h2>3. Display og elektronik</h2>
      <p>Test alle funktioner inden du betaler:</p>
      <ul>
        <li>Display tænder og viser data klart</li>
        <li>Alle assistanseniveauer skifter rigtigt (Eco/Tour/Sport/Turbo)</li>
        <li>Lygter virker (ofte tilsluttet motoren)</li>
        <li>USB-port (hvis cyklen har) oplader telefon</li>
      </ul>

      <h2>4. Kæde, krans og kassette</h2>
      <p>El-cykler slider drivlinjen meget hurtigere end almindelige cykler — fordi motoren tilfører ekstra kraft. Hvis kæden er udslidt, er kassetten ofte også. Komplet drivlinje koster 1.500-3.000 kr.</p>
      <p>Bed sælger om at fortælle hvornår kæden sidst er skiftet. Tag en kæde-slidmåler med (10 kr i en cykelhandel) for at tjekke selv.</p>

      <h2>5. Bremser — kritisk på e-cykler</h2>
      <p>Bremser på e-cykler bliver hårdere belastet pga. den højere fart og vægt. Skivebremser er standard på moderne e-cykler — tjek:</p>
      <ul>
        <li>Bremseklodserne har mindst 1 mm slidlag tilbage</li>
        <li>Skiverne er ikke nedslidt eller bøjede</li>
        <li>Bremserne stopper cyklen hårdt fra 20 km/t</li>
      </ul>

      <h2>6. Hjul og dæk</h2>
      <p>E-cykler kører ofte med 28" hjul og bredere dæk. Tjek:</p>
      <ul>
        <li><strong>Dækmønster:</strong> mindst 2-3 mm dybde tilbage</li>
        <li><strong>Eger:</strong> niv på hver enkelt — løse eger giver skæve hjul</li>
        <li><strong>Hjullejer:</strong> løft hjulet og snur det — skal være jævnt, uden støj</li>
      </ul>

      <h2>7. Service-historik og garanti</h2>
      <p>Spørg om:</p>
      <ul>
        <li>Hvornår er motoren sidst inspiceret?</li>
        <li>Er der stadig garanti? (Bosch-motorer har ofte 2 år, batterier 2 år)</li>
        <li>Kan du fortsætte garantien? (nogle brands kræver registrering hos første ejer)</li>
      </ul>

      <h2>Tjek-prisen — undgå at betale for meget</h2>
      <p>Brug <a href="/vurder-min-cykel" onclick="event.preventDefault();navigateTo('/vurder-min-cykel')">Cykelbørsens vurderingsværktøj</a> for at se markedsprisen for samme mærke + model + årgang. Som tommelfingerregel:</p>
      <ul>
        <li>1 år gammel: 70-80% af nypris</li>
        <li>2 år gammel: 55-65% af nypris</li>
        <li>3-4 år gammel: 40-50% af nypris</li>
        <li>5+ år gammel: 30-40% af nypris (batteri sandsynligvis snart udskiftningskrævende)</li>
      </ul>

      <h2>Røde flag der bør stoppe handlen</h2>
      <ul>
        <li>Batteriet er låst eller mangler oplader</li>
        <li>Motoren laver underlige lyde</li>
        <li>Sælger nægter prøvetur</li>
        <li>Prisen er over 30% under markedet (mistanke om tyveri eller skjulte fejl)</li>
        <li>Cyklen har ikke originalt batteri (third-party-batterier kan have sikkerhedsrisici)</li>
      </ul>

      <h2>Konklusion</h2>
      <p>En velholdt brugt el-cykel er en fantastisk handel. En misligholdt er en pengegrav. Tjeklisten her er nok til at skille en god købssituation fra en dårlig på 15 minutter.</p>
      <p>På Cykelbørsen kan du filtrere på "El-cykel" som type. Mange forhandlere giver også garanti på brugte e-cykler — kig efter "Garanti"-badge.</p>
    `,
  },

  'bedre-cykel-billeder': {
    slug: 'bedre-cykel-billeder',
    title: 'Tag bedre cykel-billeder: 8 tips der hæver salgsprisen',
    excerpt: 'Annoncer med gode billeder sælger op til 40% hurtigere og 10% dyrere. 8 konkrete tips du kan bruge med din mobil.',
    metaDesc: 'Tag bedre billeder af din cykel inden salg: lys, vinkler, baggrund og opsætning. Komplet guide med før/efter eksempler.',
    category: 'Salg',
    readTime: 4,
    publishedAt: '2026-10-28',
    heroEmoji: '📸',
    body: `
      <p>Forskellen mellem en cykel der sælger på 2 dage til en god pris, og en der ligger i 3 måneder med tilbud efter tilbud — det er ofte <strong>billederne</strong>. Her er 8 tips du kan bruge med din mobil. Ingen pro-udstyr nødvendig.</p>

      <h2>1. Dagslys — og kun dagslys</h2>
      <p>Tag aldrig billeder indenfor i kælderbelysning. Det giver gule farver og hårde skygger. Tag billederne udenfor i overskyet vejr — det er det perfekte lys, fordi skyerne fungerer som naturlig diffuser og fjerner skarpe skygger.</p>
      <p>Næstbedste: tidlig morgen eller sen eftermiddag ("den gyldne time") når solen står lavt.</p>

      <h2>2. Ren baggrund</h2>
      <p>Folk køber den cykel, ikke din parkeringsplads eller skraldespand. Find en simpel baggrund:</p>
      <ul>
        <li>En hvid eller grå mur</li>
        <li>Et træ-hegn</li>
        <li>Asfalt eller pen flisebelægning</li>
        <li>En park (men undgå rod i baggrunden)</li>
      </ul>
      <p>Ryd biler, skraldespande og børnelegetøj væk fra billedet. En ren baggrund signalerer at sælger har styr på sit.</p>

      <h2>3. Vinkler du SKAL have med</h2>
      <p>Mindst disse 5 billeder:</p>
      <ol>
        <li><strong>Hele cyklen fra siden</strong> (forsidebilledet — det vigtigste)</li>
        <li><strong>Forfra</strong> — viser styr, forgaffel og bremser</li>
        <li><strong>Bagfra</strong> — viser gear og bagbremse</li>
        <li><strong>Close-up af gear/krank</strong> — viser slid og kvalitet</li>
        <li><strong>Close-up af stelnummer</strong> — bygger tillid og bekræfter ejerskab</li>
      </ol>
      <p>Bonus: billede af sadel, dæk og evt. ridser/skader. Vær <strong>ærlig</strong> om skader — det skaber tillid og forhindrer reklamationer efter handelen.</p>

      <h2>4. Hold mobilen vandret og lavt</h2>
      <p>Det mest almindelige amatør-fejl: at tage billedet stående med mobilen højt oppe, så cyklen bliver lille i bunden af billedet. Ned i knæ-højde og hold mobilen <strong>vandret</strong> (landskab) for at fange hele cyklen.</p>

      <h2>5. Fyld rammen ud</h2>
      <p>Cyklen skal fylde 70-80% af billedet. Hvis der er for meget tom plads omkring, virker billedet udvandet. Zoom IND med fødderne (bevæg dig tættere på), ikke med pinch-zoom — det giver dårligere kvalitet.</p>

      <h2>6. Forsidebilledet er kongen</h2>
      <p>Det første billede er det eneste mange købere ser. Det skal vise hele cyklen fra siden — gerne med pedalen i 6-position (lige nede) og kæden synlig. Det giver det mest "klassiske" og genkendelige cykel-look.</p>

      <h2>7. Vis at cyklen er klar til brug</h2>
      <p>Inden du tager billederne:</p>
      <ul>
        <li>Vask cyklen — bare en hurtig overspuling og afpudsning</li>
        <li>Pust dækkene op til normal tryk</li>
        <li>Olie kæden (giver glat udseende på billederne)</li>
        <li>Rens skiver eller fælge for bremsestøv</li>
      </ul>
      <p>30 minutter til rengøring kan hæve salgsprisen med 5-10%.</p>

      <h2>8. Vis cyklen i brug</h2>
      <p>Det sidste billede kan være cyklen "i brug" — på en cykelsti, ved et cafétræf, på en tur. Det hjælper køberen at visualisere sig selv på cyklen. Det er ikke essentielt, men det adskiller din annonce fra andre.</p>

      <h2>Bonus: undgå disse fejl</h2>
      <ul>
        <li><strong>Spejlbilleder:</strong> billeder taget i et bilvindue eller spejl — virker amatøragtigt</li>
        <li><strong>Selfies med cyklen:</strong> ingen vil se dig — de vil se cyklen</li>
        <li><strong>Filtre og overbearbejdning:</strong> ærlige billeder sælger bedst</li>
        <li><strong>Sky-billeder af flere cykler:</strong> hold fokus på den ene cykel der sælges</li>
      </ul>

      <h2>Konklusion</h2>
      <p>Det tager 15-20 minutter at lave gode billeder. Det giver typisk 40% hurtigere salg og 5-10% højere pris. Det er nok det bedste investeringer-på-din-tid forhold der findes.</p>
      <p>Tip: når du opretter annonce på Cykelbørsen, kan du <strong>crop'e billedet</strong> direkte til 3:2-format der vises på alle cards. Det er det format købere ser når de browser — gør den crop ordentligt.</p>
    `,
  },

  'saelg-cykel-tips': {
    slug: 'saelg-cykel-tips',
    title: 'Sælg din cykel hurtigt: 6 tips til at få den bedste pris',
    excerpt: 'En god annonce kan sælge en cykel på 24 timer. En dårlig kan tage 3 måneder. 6 ting du kan gøre i dag.',
    metaDesc: 'Sælg din cykel hurtigt og dyrt: prissætning, billeder, beskrivelse og forhandling. Komplet salgsguide.',
    category: 'Salg',
    readTime: 5,
    publishedAt: '2026-10-25',
    heroEmoji: '💰',
    body: `
      <p>At sælge en cykel hurtigt og til en god pris er ingen tilfældighed — det er et håndværk. Her er 6 ting du kan gøre i dag der adskiller en annonce der sælger på 24 timer fra en der ligger og samler støv.</p>

      <h2>1. Sæt en realistisk pris fra start</h2>
      <p>Den største fejl: at sætte prisen for højt og håbe på det bedste. Resultatet er at annoncen ikke får henvendelser, du sætter ned i pris efter 2 uger, og slutprisen ender lavere end hvis du var startet realistisk.</p>
      <p>Brug <a href="/vurder-min-cykel" onclick="event.preventDefault();navigateTo('/vurder-min-cykel')">Cykelbørsens gratis vurderingsværktøj</a> for at se hvad lignende cykler faktisk sælger for. Ramt medianen, og du sælger inden for 1-2 uger.</p>
      <p>Vil du sælge ekstra hurtigt? Sæt prisen 5% under median — det giver dig forrang i søgninger og bud kommer hurtigt.</p>

      <h2>2. Beskrivelsen skal sælge — ikke bare beskrive</h2>
      <p>Skriv den i denne rækkefølge:</p>
      <ol>
        <li><strong>Mærke + model + årgang + tilstand</strong> (1 sætning)</li>
        <li><strong>Hvorfor sælges</strong> (2-3 sætninger — vær ærlig: "jeg cykler ikke nok længere")</li>
        <li><strong>Tekniske specs</strong> (gear, bremser, hjulstørrelse, vægt)</li>
        <li><strong>Hvad er nyt/skiftet</strong> (kæde, dæk, bremseklodser)</li>
        <li><strong>Eventuelle skavanker</strong> (vær ærlig)</li>
        <li><strong>Praktisk info</strong> (afhentning, mødested, betalingsform)</li>
      </ol>
      <p>Undgå generiske floskler som "fantastisk cykel, må sælges". Det virker desperat. Vær konkret og ærlig.</p>

      <h2>3. Tag virkelig gode billeder</h2>
      <p>Annoncer med 5-8 skarpe billeder sælger 3x så hurtigt som dem med 1-2 sløve billeder. Læs vores fulde <a href="/blog/bedre-cykel-billeder" onclick="event.preventDefault();navigateTo('/blog/bedre-cykel-billeder')">guide til cykel-billeder</a> — det er nok den bedste tidsinvestering du kan lave.</p>

      <h2>4. Time det rigtigt</h2>
      <p>Cykelmarkedet er sæsonafhængigt:</p>
      <ul>
        <li><strong>Marts-juni:</strong> peak — flest købere, højeste priser</li>
        <li><strong>Juli-august:</strong> stadig højt, men ferieperiode</li>
        <li><strong>September-november:</strong> faldende — folk køber mindre når det bliver koldt</li>
        <li><strong>December-februar:</strong> bunden — kun deal-jagter er aktive</li>
      </ul>
      <p>Vil du have den bedste pris: sælg i marts-april. Skal du sælge om vinteren: vær åben for at gå 10-15% under median.</p>

      <h2>5. Vær responsiv</h2>
      <p>De første henvendelser kommer typisk inden for 6 timer efter annoncen er live. Hvis du svarer inden for 1 time, har du 80% chance for at sælge. Hvis du venter til næste dag, falder chancen til 30%.</p>
      <p>Sæt notifikationer til på Cykelbørsen så du får besked når der kommer beskeder. Svar hurtigt, høfligt og konkret.</p>

      <h2>6. Forhandl smart</h2>
      <p>Næsten alle vil byde under din pris. Forbered dig:</p>
      <ul>
        <li><strong>Hav en bundgrænse</strong> — den laveste pris du kan acceptere</li>
        <li><strong>Imødekom rimelige bud</strong> — 5-10% under fast pris er normal forhandling</li>
        <li><strong>Afvis tomme bud</strong> — "vil du tage 1.500 for en 8.000 kr cykel" er ikke en forhandling</li>
        <li><strong>"Mød i midten"</strong> — Cykelbørsen viser et automatisk midtpunkts-bud du kan acceptere med et klik</li>
      </ul>
      <p>Hvis du har flere interesserede: lad det blive til en mini-auktion. "Jeg har 3 interesserede — højeste tilbud i morgen aften får cyklen". Det presser priserne op.</p>

      <h2>Bonus: opdater annoncen efter 1-2 uger</h2>
      <p>Hvis cyklen ikke er solgt efter 14 dage:</p>
      <ol>
        <li><strong>Sæt ned 5-10%</strong> — det giver fornyet synlighed i feeds</li>
        <li><strong>Skift forsidebilledet</strong> — nye billeder = ny annonce-effekt</li>
        <li><strong>Tilføj specs i titlen</strong> ("Trek FX 3 Disc M 2022 — Carbon, Shimano Tiagra")</li>
      </ol>

      <h2>Konklusion</h2>
      <p>De 6 trin tilsammen tager ~2 timer. De er typisk forskellen mellem at sælge på 3 dage til 90% af din ønskepris, eller at sælge på 6 uger til 70%. Det er en god timeløn at investere.</p>
      <p>Cykelbørsen er <strong>gratis for private sælgere</strong> — ingen oprettelsesgebyrer eller provision. Brug det til din fordel.</p>
    `,
  },

  'racercykler-under-15000': {
    slug: 'racercykler-under-15000',
    title: 'Bedste racercykler under 15.000 kr i 2026',
    excerpt: '15.000 kr er sweet spot for ny racer eller premium brugt. 6 modeller der er kvalitet hver krone værd.',
    metaDesc: 'Bedste racercykler under 15.000 kr: Trek Domane, Cube Attain, Specialized Allez og flere. Komparativ guide til budget-racing.',
    category: 'Køb',
    readTime: 6,
    publishedAt: '2026-10-20',
    heroEmoji: '🚴',
    body: `
      <p>15.000 kr er sweet spot for at komme ind i racer-cykling. Ny er du på basis/entry-niveau hos de store mærker. Brugt får du betydeligt mere — premium 2-3 år gamle cykler ligger i denne pris-zone. Her er hvad du skal kigge efter — og 6 konkrete modeller værd at overveje.</p>

      <h2>Aluminium eller carbon?</h2>
      <p>For 15.000 kr kan du få:</p>
      <ul>
        <li><strong>Ny aluminiums-racer</strong> med Shimano 105-gear (godt udgangspunkt)</li>
        <li><strong>Brugt carbon-racer</strong> 2-3 år gammel med samme gear-niveau</li>
      </ul>
      <p>Carbon er lettere og dæmper vibrationer bedre, men ny carbon i denne prisklasse er kompromis-baseret (tunge rammer, billige komponenter). Brugt carbon fra 2-3 år tilbage giver dig samme penge for premium-cykler.</p>

      <h2>6 modeller værd at overveje</h2>

      <h3>1. Trek Domane AL 4 (Ny ~12.000 kr / Brugt 7.000-9.000 kr)</h3>
      <p>Endurance-racer med aluminiumsramme og carbon-forgaffel. Shimano Tiagra-gear, hydrauliske skivebremser. Komfortabel geometri til lange ture. Trek's IsoSpeed-system reducerer vibrationer.</p>
      <p><strong>Bedst til:</strong> Begyndere, langtursryttere, fitness-cykling.</p>

      <h3>2. Cube Attain GTC (Ny ~14.000 kr / Brugt 9.000-12.000 kr)</h3>
      <p>Carbon-ramme, Shimano 105-gear, hydrauliske skivebremser. Tysk kvalitet til en aggressiv pris. Mere race-orienteret geometri end Trek Domane.</p>
      <p><strong>Bedst til:</strong> Ryttere der vil have carbon uden at brænde fingre.</p>

      <h3>3. Specialized Allez (Ny ~10.000 kr / Brugt 5.000-8.000 kr)</h3>
      <p>Klassiker — aluminium med carbon-forgaffel. Hurtig og responsiv. Mange udgaver gennem årene — fra basis til Sprint-versionen med aero-features.</p>
      <p><strong>Bedst til:</strong> Klassisk race-følelse, opbygning af basisfærdigheder.</p>

      <h3>4. Canyon Endurace AL (Ny ~12.000 kr direkte fra Canyon)</h3>
      <p>Direct-to-consumer — du sparer mellemleddet. Aluminium ramme, Shimano 105, skivebremser. Endurance-geometri. Bemærk: kommer i flat pack og kræver lidt samling.</p>
      <p><strong>Bedst til:</strong> Værdi-jagtere, dem der er DIY-mindede.</p>

      <h3>5. Cannondale Synapse AL (Ny ~13.000 kr / Brugt 7.000-10.000 kr)</h3>
      <p>Cannondales endurance-svar. Aluminium med SAVE-vibrationsdæmpning, Shimano 105 eller Tiagra afhængig af model. Komfortabel position over lange distancer.</p>
      <p><strong>Bedst til:</strong> Granfondoer, lange søndagsture.</p>

      <h3>6. Brugt Cervélo R3 / Soloist (Brugt 12.000-15.000 kr)</h3>
      <p>Hvis du jagter brugt premium: en Cervélo R3 fra 2017-2019 ligger i denne prisklasse. Carbon, Shimano Ultegra eller højere. World Tour-niveau geometri.</p>
      <p><strong>Bedst til:</strong> Performance-mindede ryttere der vil have premium-rammen.</p>

      <h2>Hvad du SKAL undgå i denne prisklasse</h2>
      <ul>
        <li><strong>Friction-shifters</strong> — gammelt teknik (1980'er), du vil have indexed shifting</li>
        <li><strong>Felgbremser uden hydraulik</strong> — OK på racer, men skivebremser er fremtiden</li>
        <li><strong>26"-hjul</strong> — gamle MTB-hjul, ikke moderne racer-standard (28"/700c er normen)</li>
        <li><strong>Mærker du aldrig har hørt om</strong> — reservedele kan være umulige at finde</li>
      </ul>

      <h2>Brugt eller ny — beslutningstræ</h2>
      <p><strong>Køb NY hvis:</strong></p>
      <ul>
        <li>Du er helt ny til racer-cykling og vil have garanti + service</li>
        <li>Du vil have en bestemt størrelse og kan ikke vente</li>
        <li>Du har ikke værktøj eller ven der kan tjekke en brugt cykel</li>
      </ul>
      <p><strong>Køb BRUGT hvis:</strong></p>
      <ul>
        <li>Du kan tjekke en cykel selv (eller har en ven der kan)</li>
        <li>Du vil have premium-kvalitet inden for budget</li>
        <li>Du er villig til at vente på den rigtige model</li>
      </ul>

      <h2>Ekstraomkostninger at huske</h2>
      <ul>
        <li><strong>Cykelhjelm</strong>: 800-2.500 kr</li>
        <li><strong>Cykelsko + pedaler</strong>: 1.500-4.000 kr (clipless = mere effektivt)</li>
        <li><strong>Tøj</strong>: cykelshorts + trøje 1.500-3.000 kr</li>
        <li><strong>Tilbehør</strong>: lås, lygter, flaskeholder, computer 1.000-3.000 kr</li>
      </ul>
      <p>Realistisk totalbudget for at komme i gang: cykel + udstyr = 18.000-23.000 kr.</p>

      <h2>Konklusion</h2>
      <p>15.000 kr giver dig en seriøs racercykel — uanset om du går for ny aluminium eller brugt carbon. På Cykelbørsen kan du filtrere på "Racercykel" og prisinterval for at se aktuelle tilbud.</p>
    `,
  },
};

// Hjælpefunktioner
export function getAllArticlesSorted() {
  return Object.values(BLOG_ARTICLES).sort((a, b) =>
    new Date(b.publishedAt) - new Date(a.publishedAt)
  );
}

export function getArticleBySlug(slug) {
  return BLOG_ARTICLES[slug] || null;
}
