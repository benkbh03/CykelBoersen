/* ============================================================
   KATEGORI-LANDINGSSIDER (/racercykler, /el-cykler, …)
   ------------------------------------------------------------
   Hver kategori mapper til en kanonisk bike.type-værdi (eksakt
   match, jf. filtrene i index.html + .eq('type', …) i bikes-list.js).
   Bruges af js/category-page.js (render) OG scripts/prerender.mjs
   (statisk HTML). Hold slugs + type-værdier i sync med begge.
   ============================================================ */

export const CATEGORY_META = {
  racercykler: {
    type: 'Racercykel',
    name: 'Racercykler',
    h1: 'Brugte og nye racercykler til salg',
    title: 'Brugte racercykler til salg — køb & sælg | Cykelbørsen',
    metaDesc: 'Find brugte og nye racercykler til salg i Danmark. Filtrér på gruppesæt, rammemateriale, størrelse og pris. Fra private sælgere og forhandlere på Cykelbørsen.',
    intro: 'Racercykler er bygget til fart og lange distancer på asfalt — lette rammer, smalle dæk og aerodynamisk geometri. På Cykelbørsen finder du alt fra budget-aluminium til Tour de France-niveau carbon, både brugt og nyt. Brug filtrene til at indsnævre på gruppesæt (Shimano 105, Ultegra, SRAM), rammemateriale, stelstørrelse og pris, så du finder den rigtige racer til dit budget.',
    faq: [
      { q: 'Hvad koster en god brugt racercykel?', a: 'En velholdt brugt racercykel i aluminium med Shimano 105 starter typisk omkring 5.000–10.000 kr, mens carbon-racere med Ultegra eller Dura-Ace ligger fra 15.000 kr og opefter. Prisen afhænger af alder, gruppesæt og stand.' },
      { q: 'Hvilken størrelse racercykel skal jeg have?', a: 'Racercykler måles typisk i cm (stellængde) eller S/M/L. Din højde og indvendige benlængde afgør størrelsen — se vores stelstørrelse-guide for en tabel, eller filtrér direkte på størrelse her på siden.' },
      { q: 'Skal jeg vælge aluminium eller carbon?', a: 'Aluminium er billigere og robust — godt til begynder og pendling. Carbon er lettere og dæmper vibrationer bedre, men koster mere. Til de fleste motionister er en aluminiumsracer med et godt gruppesæt et bedre køb end en billig carbon.' },
    ],
    related: ['gravelbikes', 'mountainbikes', 'el-cykler'],
  },
  mountainbikes: {
    type: 'Mountainbike',
    name: 'Mountainbikes',
    h1: 'Brugte og nye mountainbikes (MTB) til salg',
    title: 'Brugte mountainbikes (MTB) til salg | Cykelbørsen',
    metaDesc: 'Køb og sælg brugte og nye mountainbikes i Danmark. Hardtail og fuld affjedring (fully), 29" og 27,5". Filtrér på affjedring, gruppesæt og pris på Cykelbørsen.',
    intro: 'Mountainbikes er bygget til terræn — skov, spor og downhill. Valget står først og fremmest mellem hardtail (kun forgaffel-affjedring) og fully (fuld affjedring), og derfra mellem hjulstørrelser og gruppesæt. På Cykelbørsen finder du brugte og nye MTB\'er fra alle de store mærker. Filtrér på affjedring, rammemateriale og pris for at finde den rette til din kørsel.',
    faq: [
      { q: 'Hardtail eller fully — hvad skal jeg vælge?', a: 'Hardtail (kun forgaffel) er lettere, billigere og kræver mindre vedligehold — godt til lettere spor og skovveje. Fully (fuld affjedring) giver mere kontrol og komfort i teknisk terræn, men koster mere. Se vores MTB-affjedringsguide i bloggen for hjælp.' },
      { q: 'Hvad koster en god brugt mountainbike?', a: 'En brugbar brugt hardtail starter omkring 3.000–6.000 kr, mens en god fully med luftaffjedring og hydrauliske bremser typisk ligger fra 8.000 kr og op. Full-carbon race-MTB\'er kan koste betydeligt mere.' },
      { q: 'Hvilken hjulstørrelse er bedst?', a: '29" ruller hurtigere og glider bedre hen over forhindringer, mens 27,5" er mere adræt og legende. De fleste moderne trail- og cross-country-cykler bruger 29".' },
    ],
    related: ['gravelbikes', 'racercykler', 'el-cykler'],
  },
  'el-cykler': {
    type: 'El-cykel',
    name: 'El-cykler',
    h1: 'Brugte og nye el-cykler til salg',
    title: 'Brugte el-cykler til salg — køb & sælg | Cykelbørsen',
    metaDesc: 'Find brugte og nye el-cykler i Danmark. Tjek batteri, motor og rækkevidde. Bosch, Shimano, Mahle m.fl. Filtrér på motor og pris på Cykelbørsen.',
    intro: 'El-cykler gør pendling, indkøb og længere ture nemmere med motorstøtte fra mærker som Bosch, Shimano og Mahle. Ved køb af en brugt el-cykel er batteriets stand og motorens kilometertal det vigtigste — spørg altid ind til det. På Cykelbørsen finder du brugte og nye el-cykler i alle kategorier: city, trekking, MTB og ladcykler. Filtrér på motor-mærke, placering og pris.',
    faq: [
      { q: 'Hvad skal jeg tjekke ved en brugt el-cykel?', a: 'Batteriet er det dyreste at udskifte — spørg om alder, antal opladninger og resterende kapacitet. Tjek også motorens kilometertal, om der er kvittering/garanti, og om bremser og gear fungerer. Se vores blogguide "Køb brugt el-cykel: 7 ting du skal tjekke".' },
      { q: 'Hvor længe holder et el-cykel-batteri?', a: 'Et godt lithium-batteri holder typisk 500–1.000 fulde opladninger, svarende til cirka 3–6 års normal brug, før kapaciteten falder mærkbart. Opbevaring og opladningsvaner har stor betydning.' },
      { q: 'Hvad koster et nyt batteri?', a: 'Et originalt udskiftningsbatteri koster typisk 3.000–6.000 kr afhængigt af mærke og kapacitet. Regn det med i prisen, hvis batteriet på en brugt el-cykel er slidt.' },
    ],
    related: ['citybikes', 'ladcykler', 'mountainbikes'],
  },
  citybikes: {
    type: 'Citybike',
    name: 'Citybikes',
    h1: 'Brugte og nye citybikes til salg',
    title: 'Brugte citybikes & pendlercykler til salg | Cykelbørsen',
    metaDesc: 'Køb og sælg brugte og nye citybikes og pendlercykler i Danmark. Komfortable bycykler til hverdagen. Filtrér på gear, størrelse og pris på Cykelbørsen.',
    intro: 'Citybikes er hverdagens arbejdshest — komfortabel oprejst siddestilling, skærme, lys og ofte nav-gear til lav vedligehold. De er perfekte til pendling og indkøb i byen. På Cykelbørsen finder du brugte og nye citybikes fra danske og europæiske mærker. Filtrér på geartype, størrelse og pris for at finde den rette bycykel.',
    faq: [
      { q: 'Nav-gear eller klassisk kædegear på en citybike?', a: 'Nav-gear (fx Shimano Nexus) er lukket, kræver næsten ingen vedligehold og kan skiftes stillestående — ideelt til bykørsel. Klassisk kædegear giver flere gear og er lettere, men kræver mere pleje. Til pendling foretrækker mange nav-gear.' },
      { q: 'Hvad koster en god brugt citybike?', a: 'En velholdt brugt citybike koster typisk 1.500–4.000 kr afhængigt af mærke, gear og stand. Kvalitetsmærker med nav-gear og hydrauliske bremser ligger i den høje ende.' },
    ],
    related: ['el-cykler', 'ladcykler', 'boernecykler'],
  },
  ladcykler: {
    type: 'Ladcykel',
    name: 'Ladcykler',
    h1: 'Brugte og nye ladcykler til salg',
    title: 'Brugte ladcykler til salg — christiania & long john | Cykelbørsen',
    metaDesc: 'Find brugte og nye ladcykler i Danmark — christianiacykler, long john og el-ladcykler. Til børn og transport. Filtrér på type og pris på Cykelbørsen.',
    intro: 'Ladcyklen er den danske familiebils alternativ — til børn, indkøb og transport. Der findes tohjulede long john-modeller (hurtige, adrætte) og trehjulede kassecykler (stabile, rummelige), i stigende grad med el-motor. På Cykelbørsen finder du brugte og nye ladcykler fra Christiania Bikes, Bullitt, Babboe, Urban Arrow og flere. Filtrér på pris og udstyr.',
    faq: [
      { q: 'To eller tre hjul på en ladcykel?', a: 'Trehjulede (kassecykler som Christiania og Babboe) står selv og er stabile ved lav fart — trygt med børn. Tohjulede (long john som Bullitt) er hurtigere og lettere at manøvrere i trafik, men kræver lidt tilvænning. Vælg efter last, afstand og komfort.' },
      { q: 'Er en brugt el-ladcykel et godt køb?', a: 'El-motor gør en stor forskel på en tung ladcykel, især med børn og på bakker. Ved brugtkøb er batteriets og motorens stand afgørende — tjek kilometertal og batterikapacitet, ligesom ved en almindelig el-cykel.' },
    ],
    related: ['el-cykler', 'citybikes', 'boernecykler'],
  },
  boernecykler: {
    type: 'Børnecykel',
    name: 'Børnecykler',
    h1: 'Brugte og nye børnecykler til salg',
    title: 'Brugte børnecykler til salg — alle størrelser | Cykelbørsen',
    metaDesc: 'Køb og sælg brugte og nye børnecykler i Danmark — 12", 16", 20", 24". Find den rigtige størrelse til dit barn. Filtrér på pris på Cykelbørsen.',
    intro: 'Børn vokser hurtigt, og en brugt børnecykel er derfor ofte et klogt køb — de er typisk let brugte og holder fint til næste barn. Størrelsen angives i tommer på hjulet (12", 16", 20", 24") og vælges efter barnets højde. På Cykelbørsen finder du brugte og nye børnecykler fra kvalitetsmærker som Woom, Puky og Frog. Filtrér på størrelse og pris.',
    faq: [
      { q: 'Hvilken størrelse børnecykel passer mit barn?', a: 'Vælg efter barnets højde: 12" til ca. 95–105 cm, 16" til 105–120 cm, 20" til 115–135 cm og 24" til 130–145 cm. Barnet skal kunne nå jorden med tæerne, når det sidder på sadlen. Prøv altid cyklen af hvis muligt.' },
      { q: 'Er brugte børnecykler et godt køb?', a: 'Ja — børn vokser fra cyklerne før de er slidt op, så brugte børnecykler er ofte i god stand til det halve af nyprisen. Kvalitetsmærker som Woom og Puky er lette og holder værdien godt ved videresalg.' },
    ],
    related: ['citybikes', 'mountainbikes', 'ladcykler'],
  },
  gravelbikes: {
    type: 'Gravel',
    name: 'Gravelbikes',
    h1: 'Brugte og nye gravelbikes til salg',
    title: 'Brugte gravelbikes til salg — grus & eventyr | Cykelbørsen',
    metaDesc: 'Find brugte og nye gravelbikes i Danmark. Én cykel til grus, asfalt og bikepacking. Filtrér på gruppesæt (GRX, Apex), dæk og pris på Cykelbørsen.',
    intro: 'Gravelbiken er den alsidige alt-terræn-racer — bredere dæk og mere afslappet geometri end en racer, men hurtigere end en MTB. Den kan det hele: grusveje, skovspor, pendling og bikepacking. På Cykelbørsen finder du brugte og nye gravelbikes med gravel-specifikke gruppesæt som Shimano GRX og SRAM Apex/XPLR. Filtrér på gruppesæt, rammemateriale og pris.',
    faq: [
      { q: 'Hvad er forskellen på en gravelbike og en racercykel?', a: 'En gravelbike har plads til bredere dæk (typisk 38–45 mm mod racerens 25–32 mm), en mere afslappet og stabil geometri og ofte lavere gearing. Det gør den bedre til grus og lange dage i sadlen, mens en ren racer er hurtigere på asfalt.' },
      { q: 'Kan man bruge en gravelbike til pendling?', a: 'Ja — gravelbiken er fremragende til pendling. De brede dæk giver komfort og greb i alt vejr, og der er ofte monteringshuller til skærme og pakageholder. Én cykel til både arbejde og weekend-eventyr.' },
    ],
    related: ['racercykler', 'mountainbikes', 'citybikes'],
  },
};

export const CATEGORY_SLUGS = Object.keys(CATEGORY_META);
