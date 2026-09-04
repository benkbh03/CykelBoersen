# CykelBørsen — retning

Én side. Læses før hver ny funktion. Hvis en idé ikke kan placeres her, skal den ikke bygges.

## Hvad vi laver

**Det sted man går hen, når man skal købe eller sælge en cykel i Danmark.**

Som Bilbasen er det for biler: ikke en rubrikannonce blandt alt muligt andet, men en dedikeret markedsplads hvor køretøjet er beskrevet ordentligt nok til at man kan træffe en beslutning uden at have set det.

Både forhandlere og private, samme sted, samme krav. Ikke to systemer i ét.

**Forhandlerne er motoren.** Bilbasen virker fordi bilforhandlerne er der i fuldt omfang, og de private følger med. Sådan er det også her. En markedsplads der kun er private sælgere, er en DBA-kategori. En hvor landets cykelhandlere har hele deres lager liggende, er noget andet — og det er den der får en køber til at gå direkte hertil frem for at søge på Google.

## Hvad vi vinder på

Vi kan ikke slå DBA på volumen eller Facebook på rækkevidde. Vi kan slå dem begge på at **vide hvad en cykel er.**

Groupset, motor, stelmateriale, affjedring, hjulstørrelse, vægt. Det er dyrt for en generisk markedsplads at kopiere, fordi det kræver at man gider cykler. Derfor er tjeklisten for filter-konsistens i `CLAUDE.md` tolv punkter lang: filtrene er kronjuvelen, og et filter der kun virker halvt er værre end intet filter, fordi det lærer brugeren at søgningen ikke kan bruges.

## De tre retninger

**1. Nemt at få cyklen op.** En annonce skal kunne laves på en telefon i regnvejr. Foto først, resten udfyldt for brugeren hvor vi kan. For forhandlere: feed-import, ikke manuelt arbejde.

**2. Gennemsigtigt at handle.** Køberen skal kunne se hvad hun har med at gøre, før hun bruger en aften på at køre derhen. Sælgertype, verifikation, responstid, prishistorik, tekniske specifikationer, anmeldelser der er bundet til rigtige handler.

**3. Sværere at sælge en stjålen cykel.** Vi kan ikke slå op i politiets register, og vi skal ikke lade som om. Det vi kan, er at få sælgeren til at **binde sig offentligt før mødet** — stelnummer oplyst på forhånd, som køberen kan holde op mod stellet ved overdragelsen. En løgn bliver dyr i stedet for gratis. Og vi skal kunne dokumentere hvad vi vidste hvornår, når nogen spørger.

## Prøven

Enhver ændring skal kunne svare ja til mindst én, uden at gøre en af de andre værre:

- Gør den det **hurtigere eller mere præcist** at få en cykel op?
- Gør den det **lettere at bedømme** en cykel eller en sælger på afstand?
- Gør den det **dyrere at snyde** — som sælger, som køber eller som tyv?

Kan den ikke det, er den ikke på vejen. Uanset hvor sjov den er at bygge.

## Hvad vi ikke laver

Det her er den halvdel der gør en strategi til en strategi.

**Ikke breddemarkedsplads.** Cykler og cykeltilbehør. Ikke løbehjul, ikke bildele, ikke "alt til fritid". Bredde er DBA's spil, og det er tabt på forhånd.

**Ikke betalingsformidler, før der er en grund.** I det sekund penge går gennem os, udløser det regulering (betalingstjenester, hvidvask, DAC7-indberetning) og ansvar for handler vi ikke er part i. Escrow er en stærk funktion og en meget dyr beslutning. Den træffes bevidst eller slet ikke.

**Ikke funktioner vi ikke har råd til at gøre færdige.** Det her er ikke en påmindelse om at være grundig — alle er enige i at en funktion skal virke alle steder, og de fire huller vi har fundet blev bygget af nogen der også mente det. Elleve af tretten steder føles som færdigt.

Reglen er en **pris der betales inden vi siger ja**: rører idéen cyklens datamodel, koster den tretten steder (tjeklisten i `CLAUDE.md`). Er en selvstændig side med egne data, koster den ét eller to. Første spørgsmål til en ny idé er derfor ikke "er den god", men **"hvor mange steder skal den leve"** — svaret afgør som regel om den er god nok til prisen.

Er den ikke det, siger vi nej til idéen. Ikke til de sidste to steder.

**Ikke noget der kun tjener forhandlere på privates bekostning, eller omvendt.** Køberen skal kunne stole på begge. Ryger den ene side, ryger markedspladsen.

## Rammen der ikke ændrer sig

**Det er én person.** Alt hvad der bygges, skal vedligeholdes af den samme person om to år. Det er ikke en note i margenen, det er den hårdeste begrænsning der findes her. Et halvfærdigt system er dyrere end ingenting, fordi det skal huskes.

Derfor: hellere fem funktioner der virker overalt end femten der virker nogle steder.

**Hvor Bilbasen-analogien holder op.** En brugt bil koster over hundrede tusind, har nummerplade, synsrapport og et statsligt register bag sig. Det bærer en hel industri af data- og finansieringstjenester ovenpå. En brugt privat cykel koster nogle få tusind og har ingen af delene.

Strukturen og kategoriejerskabet kan kopieres fra Bilbasen. Forretningsmodellen kan ikke skaleres ned proportionalt. Pengene ligger hos **forhandlerne og deres nye cykler**, hvor beløbene er store nok til at ligne et bilsalg. Det private brugtsalg tjener ikke penge og skal ikke forventes at gøre det — det er der for likviditeten og for vanen. Det er dét der får folk til at komme igen, og uden dem har forhandlerne ingen at sælge til.

Bygger vi noget der kun giver mening ved en bilpris, har vi taget analogien for langt.

## Hvornår denne fil skal ændres

Når retningen ændrer sig — ikke når en funktion gør. Bliver `Hvad vi ikke laver` løbende kortere, er det ikke fordi strategien udvikler sig. Det er fordi den er holdt op med at afgrænse noget.
