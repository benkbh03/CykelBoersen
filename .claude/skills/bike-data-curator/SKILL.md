---
name: bike-data-curator
description: Vedligehold og fakta-tjek af cykelmærke-data i js/brand-data-v2.js. Brug AUTOMATISK når brugeren beder om at tilføje et nyt mærke, opdatere en eksisterende beskrivelse, eller når der opdages en faktuel fejl. Skill validerer mod flere kilder, fjerner AI-stil (em-dashes, broken sentences), sikrer korrekt staving (Cervélo med accent osv.), og bevarer konsistent format på tværs af alle mærker. Brug ikke til at oprette nye datakilder eller refactor brand-data.js' struktur.
---

# Bike-data Curator (CykelBørsen)

## Formål
`js/brand-data-v2.js` driver `/mærker/<brand>` SEO-landing-pages. Hver entry skal være fakta-rigtig (cykellovers fanger fejl), staves korrekt (specialtegn matter), og være skrevet i naturlig dansk prosa — ikke AI-genereret "først dette, dernæst hint, og endelig"-format.

## Faktaforskning — sandhedskilder

Når jeg tilføjer eller opdaterer mærke-data, validér mod MINDST to af disse:

1. **Wikipedia (engelsk + tysk)** — generelt mest pålidelig for grundoplysninger
2. **Mærkets egen "About"-side** — for officielle datoer, oprindelse, sloganer
3. **Bike Europe / Cycling Industry News** — for opkøb, ejerskifter, omstruktureringer
4. **DBA / Trendsales-annoncer** — for typisk dansk markedsdistribution
5. **Bicycling Magazine, GCN, BikeRadar** — for performance-kategori og positioning

Ved konflikter mellem kilder: brug det mest gentagne på tværs af mindst 3 uafhængige kilder. Hvis usikkert, sæt feltet til `null` i stedet for at gætte.

## CykelBørsens kendte fakta-fejl-mønstre

Jeg har historisk lavet disse fejl. Tjek for dem:

| Mærke | Korrekt fakta |
|---|---|
| Centurion | **Dansk** (ikke tysk) — grundlagt i Danmark i 1976 |
| MBK | **Fransk** (Motobécane, senere Yamaha) — IKKE dansk, IKKE 1972 |
| GT | **1979** (ikke 1972) |
| LOOK | **1951 for ski-bindings**, cykelpedaler først i 1984 — vær præcis i datoangivelser |
| Scott | Grundlagt af amerikaner Ed Scott (1958, ski) — flyttede til Schweiz senere |
| Wilier | Navnet kom EFTER WW2, ikke ved grundlæggelsen i 1906 |
| Bianchi | "Et af verdens ældste cykelmærker" — IKKE "verdens ældste" (det er uverificerbart) |
| Mate Bike | **København** (ikke Aarhus) — DK-brand |
| Avenue, SCO, Norden, Amladcykler, E-Fly mv. | **Sæt year til `null`** hvis du ikke kan verificere — gæt aldrig |

## Schema for hver entry

```js
{
  slug: 'trek',                   // URL-segment, lowercase, ingen specialtegn
  name: 'Trek',                   // Display-navn — BEHOLD specialtegn (Cervélo, Felt, BMC)
  country: 'USA',                 // Lande-navn på dansk
  founded: 1976,                  // Number eller null
  description: '...',             // 2-4 sætninger i naturlig dansk prosa
  categories: ['Racer', 'MTB'],   // Array af typer der matcher vores type-filter
  popular: true,                  // Bool — vises i "Populære mærker"-sektion
}
```

## Skriveregler for `description`-feltet

### Stil
- **2-4 sætninger**, ikke længere
- **Naturlig dansk prosa** — ikke "først... dernæst... endelig" struktur
- **Ingen em-dashes som separator** (`—`) — brug komma eller punktum
- **Variation i sætningslængde** — ikke alle sætninger 10 ord lange
- **Konkrete fakta** før generelle påstande ("Trek lavede Madone-serien i 2003" > "Trek er kendt for kvalitet")
- **Aktiv stemme før passiv** ("Bianchi lancerede..." > "Lancerede blev af Bianchi...")

### Format-tjekliste

- [ ] Ingen "—" som sætnings-separator
- [ ] Ingen sætning starter med "Først,", "Dernæst,", "Endelig,"
- [ ] Sætningslængde varierer (kort + langt mønster)
- [ ] Ingen "I dag er X kendt for..." kliche
- [ ] Ingen overdrivelser som "verdens bedste" / "verdens førende" (kan ikke bevises)
- [ ] Ingen "tre ting"-listestil i prosa

### Eksempel — GODT

> Trek blev grundlagt i Wisconsin i 1976 og hører i dag til verdens største cykelfabrikanter. Mærket er især kendt for racercykler som Madone og Émonda, men har også solide MTB- og hverdagscykler i sortimentet. Trek ejer Bontrager og har samarbejdet med flere af de største ryttere i moderne landevejscykling.

### Eksempel — DÅRLIGT (typisk AI-stil)

> Trek er et amerikansk cykelmærke — grundlagt i 1976 — og en af verdens førende producenter. Først blev de kendt for racercykler, dernæst MTB, og endelig hverdagscykler. I dag er Trek synonym med kvalitet og innovation.

## Procedure

Når brugeren beder om at tilføje fx Bianchi:

1. **Slå op** i to-tre kilder (Wikipedia + bianchi.com + Bike Europe)
2. **Identificér fakta-konflikter** og notér det mest verificerbare
3. **Skriv `description`** efter format-tjeklisten ovenfor
4. **Tjek staveform**: special-tegn (Cervélo, Wilier, Cüpa, Mömo) er korrekte
5. **Bestem `categories`** baseret på faktisk produktportefølje
6. **Bestem `popular`**: kun true hvis brand har > 5% markedsandel i DK eller > 50 åbne annoncer på DBA
7. **Vis diff** og bed bruger bekræfte fakta før jeg gemmer

## VIGTIGT — undgå

- ❌ Gæt aldrig year — sæt `null`
- ❌ Skriv aldrig "verdens største / bedste" uden kilde
- ❌ Brug aldrig em-dash som separator
- ❌ Tilføj aldrig mærker uden mindst én DK-relevans (importeret eller solgt her)
- ❌ Fjern aldrig eksisterende mærker uden bekræftelse — kan have eksisterende annoncer
