/* ============================================================
   BRAND-METADATA
   Bruges af /cykler/:brand-landingssider for SEO + indhold.

   slug = URL-vennlig version af brand-navn (lowercase, ingen specialtegn).
   Mappingen er to-vejs: name ↔ slug.
   ============================================================ */

// Top 15 brands med fuld kuration. Resten genereres via fallback.
export const BRANDS_META = {
  trek: {
    name: 'Trek',
    country: 'USA',
    founded: 1976,
    tagline: 'Amerikansk kvalitet siden 1976',
    description: 'Trek er en af verdens største cykelproducenter, grundlagt i Waterloo, Wisconsin i 1976. Mærket er kendt for sit brede sortiment der dækker fra børnecykler til Tour de France-vindende racere. Trek står bag legendariske modelserier som FX (citybike), Domane (endurance race), Madone (aero race), Émonda (let race) og Fuel EX (trail-MTB).',
    popular_models: {
      'Citybike': ['FX 1 Disc', 'FX 2 Disc', 'FX 3 Disc', 'Verve 2'],
      'Racercykel': ['Domane SL 5', 'Domane SL 6', 'Madone SL 6', 'Émonda ALR 5'],
      'Mountainbike': ['Marlin 5', 'Marlin 7', 'Fuel EX 5', 'Top Fuel 5'],
    },
    typical_price_range: '3.000 – 80.000 kr',
  },
  cube: {
    name: 'Cube',
    country: 'Tyskland',
    founded: 1993,
    tagline: 'Tysk ingeniørkunst til alle prisklasser',
    description: 'Cube er en tysk cykelproducent grundlagt i Bayern i 1993. Mærket er kendt for sit utrolig brede sortiment og høj kvalitet-til-pris ratio. Cube tilbyder alt fra entry-level racere (Attain) over premium aero-cykler (Litening) til mountainbikes (Reaction, Stereo) og e-cykler (Reaction Hybrid).',
    popular_models: {
      'Racercykel': ['Attain', 'Attain GTC', 'Agree C:62', 'Litening C:68X'],
      'Mountainbike': ['Reaction', 'Stereo', 'AMS 100'],
      'El-cykel': ['Reaction Hybrid', 'Stereo Hybrid', 'Touring Hybrid'],
      'Citybike': ['Hyde', 'Travel'],
    },
    typical_price_range: '4.000 – 60.000 kr',
  },
  specialized: {
    name: 'Specialized',
    country: 'USA',
    founded: 1974,
    tagline: 'Innovation i hver detalje',
    description: 'Specialized blev grundlagt i 1974 i Californien og er en af de mest innovative cykelproducenter i verden. Mærket er især kendt for Tarmac (race), Roubaix (endurance), Stumpjumper (MTB) og Turbo (e-bike-serien). Verdens første serieproducerede mountainbike, Stumpjumper fra 1981, blev lavet af Specialized.',
    popular_models: {
      'Racercykel': ['Tarmac SL7', 'Roubaix Sport', 'Allez Sprint'],
      'Mountainbike': ['Stumpjumper', 'Rockhopper', 'Epic'],
      'El-cykel': ['Turbo Vado', 'Turbo Como', 'Turbo Levo'],
    },
    typical_price_range: '5.000 – 100.000 kr',
  },
  canyon: {
    name: 'Canyon',
    country: 'Tyskland',
    founded: 2002,
    tagline: 'Direkte fra producent til dig',
    description: 'Canyon er kendt for sit direct-to-consumer salgsmodel — de sælger udelukkende online uden mellemled, hvilket giver høj kvalitet til konkurrencedygtige priser. Mærket leverer cykler i toppen af World Tour-feltet (Movistar, Alpecin–Deceuninck). Aeroad, Ultimate og Endurace er deres racer-modeller.',
    popular_models: {
      'Racercykel': ['Endurace', 'Ultimate CF SL', 'Aeroad CF SL'],
      'Mountainbike': ['Spectral', 'Neuron', 'Strive'],
      'Gravel': ['Grail CF'],
    },
    typical_price_range: '6.000 – 80.000 kr',
  },
  cannondale: {
    name: 'Cannondale',
    country: 'USA',
    founded: 1971,
    tagline: 'Amerikansk pioner i aluminiums-cykler',
    description: 'Cannondale blev grundlagt i Connecticut i 1971 og var en af pionererne i aluminiumsrammer. Kendt for innovative designs som SAVE-systemet (vibrationsdæmpning), HollowGram-kranke og Lefty-forgaffel. Topmodellerne SuperSix Evo og SystemSix kører i top-niveau.',
    popular_models: {
      'Racercykel': ['Synapse', 'SuperSix Evo', 'CAAD13', 'SystemSix'],
      'Mountainbike': ['Habit', 'Scalpel', 'Trail'],
      'Citybike': ['Quick', 'Bad Boy', 'Treadwell'],
    },
    typical_price_range: '5.000 – 90.000 kr',
  },
  giant: {
    name: 'Giant',
    country: 'Taiwan',
    founded: 1972,
    tagline: 'Verdens største cykelproducent',
    description: 'Giant er verdens største cykelproducent målt på enheder. Grundlagt i Taiwan i 1972 og producerer både egne mærke-cykler og OEM for andre mærker. Kendt for høj kvalitet til konkurrencedygtige priser og innovativ rammeproduktion. TCR (race), Defy (endurance) og Trance (MTB) er deres bedst kendte serier.',
    popular_models: {
      'Racercykel': ['TCR Advanced', 'Defy Advanced', 'Propel Advanced'],
      'Mountainbike': ['Trance', 'Anthem', 'Talon'],
      'El-cykel': ['Quick-E+', 'Explore E+'],
    },
    typical_price_range: '4.000 – 70.000 kr',
  },
  scott: {
    name: 'Scott',
    country: 'Schweiz',
    founded: 1958,
    tagline: 'Schweizisk præcision og let vægt',
    description: 'Scott er en schweizisk cykelproducent grundlagt af ski-pioner Ed Scott. Mærket har vundet flere World Tour-etaper og er kendt for ekstremt lette rammer (Addict, Foil) og premium mountainbikes (Spark, Genius).',
    popular_models: {
      'Racercykel': ['Addict', 'Foil', 'Speedster'],
      'Mountainbike': ['Spark', 'Genius', 'Scale'],
      'Gravel': ['Addict Gravel', 'Speedster Gravel'],
    },
    typical_price_range: '5.000 – 90.000 kr',
  },
  bianchi: {
    name: 'Bianchi',
    country: 'Italien',
    founded: 1885,
    tagline: 'Verdens ældste cykelmærke',
    description: 'Bianchi er verdens ældste stadig-aktive cykelmærke, grundlagt i Milano i 1885. Genkendelig på den karakteristiske "Celeste"-grønne farve. Brand kører i WorldTour og har historisk produceret cykler til mange af cykelsportens største legender. Oltre, Specialissima og Infinito er topmodellerne.',
    popular_models: {
      'Racercykel': ['Oltre XR4', 'Specialissima', 'Infinito CV', 'Sprint'],
      'Citybike': ['Spillo', 'Cortina'],
      'Gravel': ['Impulso All-Road', 'Arcadex'],
    },
    typical_price_range: '6.000 – 120.000 kr',
  },
  kildemoes: {
    name: 'Kildemoes',
    country: 'Danmark',
    founded: 1942,
    tagline: 'Dansk kvalitet siden 1942',
    description: 'Kildemoes er et dansk cykelmærke grundlagt i 1942 på Fyn. Mærket har gennem 80 år leveret pålidelige citybikes, ladcykler og el-cykler til danske husstande. Særligt kendt for klassiske transportcykler, børnecykler og e-bikes til hverdagsbrug.',
    popular_models: {
      'Citybike': ['Street Classic', 'Logic', 'Initial'],
      'El-cykel': ['Bonanza', 'Initial e'],
      'Børnecykel': ['Bibi', 'Cliff'],
    },
    typical_price_range: '2.500 – 25.000 kr',
  },
  mbk: {
    name: 'MBK',
    country: 'Danmark',
    founded: 1972,
    tagline: 'Klassisk dansk kvalitet',
    description: 'MBK er et dansk cykelmærke der har leveret pålidelige hverdags- og transportcykler i Danmark siden 1970erne. Kendt for solide citybikes, ladcykler og børnecykler til konkurrencedygtige priser.',
    popular_models: {
      'Citybike': ['Style', 'Vision', 'Cleam'],
      'El-cykel': ['Eco', 'Forte'],
      'Børnecykel': ['Boomer'],
    },
    typical_price_range: '2.000 – 18.000 kr',
  },
  'cervélo': {
    name: 'Cervélo',
    country: 'Canada',
    founded: 1995,
    tagline: 'Aerodynamik perfektioneret',
    description: 'Cervélo blev grundlagt af to ingeniørstuderende i Canada i 1995 og specialiserer sig i aerodynamiske racercykler. Pionerer inden for vindtunnel-testing og brugte tidligt CFD-simulationer. S-serien (aero) og R-serien (klatre) er deres mest kendte.',
    popular_models: {
      'Racercykel': ['S5', 'R5', 'Caledonia', 'Soloist'],
      'Triatlon': ['P5', 'P-Series'],
      'Gravel': ['Áspero'],
    },
    typical_price_range: '15.000 – 150.000 kr',
  },
  pinarello: {
    name: 'Pinarello',
    country: 'Italien',
    founded: 1953,
    tagline: 'Italiensk håndværk fra Treviso',
    description: 'Pinarello er en legendarisk italiensk cykelproducent grundlagt af Giovanni Pinarello i Treviso i 1953. Cyklerne er vundet Tour de France utallige gange — særligt med Team Sky/INEOS. Karakteristisk asymmetrisk ramme og premium prislapper.',
    popular_models: {
      'Racercykel': ['Dogma F', 'Prince', 'Paris', 'Razha'],
      'Gravel': ['Grevil'],
      'Triatlon': ['Bolide'],
    },
    typical_price_range: '20.000 – 200.000 kr',
  },
  merida: {
    name: 'Merida',
    country: 'Taiwan',
    founded: 1972,
    tagline: 'Asiatisk kvalitet til konkurrencedygtige priser',
    description: 'Merida er en taiwanesisk cykelproducent grundlagt i 1972. En af verdens største cykelproducenter, med fokus på god kvalitet til moderate priser. Sponsor af WorldTour-holdet Bahrain Victorious. Scultura (race) og Big.Nine (MTB) er deres bedst kendte.',
    popular_models: {
      'Racercykel': ['Scultura', 'Reacto', 'Silex'],
      'Mountainbike': ['Big.Nine', 'One-Sixty', 'eOne-Sixty'],
      'Citybike': ['Crossway'],
    },
    typical_price_range: '4.000 – 60.000 kr',
  },
  kalkhoff: {
    name: 'Kalkhoff',
    country: 'Tyskland',
    founded: 1919,
    tagline: 'Tysk ekspertise i el-cykler',
    description: 'Kalkhoff er en tysk cykelproducent grundlagt i 1919 og er i dag en af Europas ledende producenter af el-cykler. Mærket har specialiseret sig i premium e-bikes til pendling, touring og hverdagskørsel, ofte med Bosch- eller Shimano-motorer.',
    popular_models: {
      'El-cykel': ['Endeavour', 'Image', 'Entice', 'Berleen'],
      'Citybike': ['Voyager Move'],
    },
    typical_price_range: '8.000 – 40.000 kr',
  },
  vanmoof: {
    name: 'VanMoof',
    country: 'Holland',
    founded: 2009,
    tagline: 'Smart urban e-cykling',
    description: 'VanMoof er et hollandsk cykelmærke grundlagt i 2009 med fokus på smarte el-cykler til byboer. Cyklerne har integreret motor, batteri, GPS, alarm og smartphone-kontrol via app. Designet er minimalistisk og premium.',
    popular_models: {
      'El-cykel': ['S3', 'X3', 'S5', 'A5'],
    },
    typical_price_range: '10.000 – 30.000 kr',
  },
};

// Brand-aliaser (forskellige stavemåder → samme slug)
const ALIASES = {
  'cervelo': 'cervélo',
  'specialised': 'specialized',
};

/**
 * Konvertér brand-navn til URL-slug.
 * "Cube" → "cube", "Cervélo" → "cervélo", "Riese & Müller" → "riese-mueller"
 */
export function brandToSlug(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, '-')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/[^\wæøåéèáàíóú-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Konvertér slug tilbage til brand-navn for opslag.
 * Returnerer null hvis slug ikke matcher kendt brand.
 */
export function slugToBrand(slug) {
  if (!slug) return null;
  const normalized = (ALIASES[slug] || slug).toLowerCase();

  // Direkte match på kurateret brand
  if (BRANDS_META[normalized]) return BRANDS_META[normalized].name;

  // Søg i alle kendte brands
  for (const brand of KNOWN_BRANDS) {
    if (brandToSlug(brand) === normalized) return brand;
  }
  return null;
}

/**
 * Hent metadata for et brand. Hvis ikke kurateret, returnér genereret fallback.
 */
export function getBrandMeta(brandName) {
  if (!brandName) return null;
  const slug = brandToSlug(brandName);
  const curated = BRANDS_META[slug];
  if (curated) return curated;

  // Fallback for ikke-kurateret brand
  return {
    name: brandName,
    country: null,
    founded: null,
    tagline: null,
    description: `${brandName} er et cykelmærke med annoncer til salg på Cykelbørsen. Find brugte og nye ${brandName}-cykler fra både private sælgere og forhandlere.`,
    popular_models: null,
    typical_price_range: null,
  };
}

// Komplet liste over kendte brands (synkroniseret med js/bikes-list.js)
export const KNOWN_BRANDS = [
  'Amladcykler','Avenue','Babboe','Batavus','Bergamont','Bianchi',
  'Bike by Gubi','Black Iron Horse','BMC','Brompton',
  'Butchers & Bicycles','Cannondale','Canyon','Carqon','Centurion',
  'Cervélo','Christiania Bikes','Colnago','Conway','Corratec','Cube',
  'E-Fly','Early Rider','Electra','Everton','FACTOR','Felt','Focus',
  'Frog Bikes','Gazelle','Ghost','Giant','GT','Gudereit','Haibike',
  'Husqvarna','Kalkhoff','Kildemoes','Koga','Kona','Kreidler',
  'Lapierre','Larry vs Harry / Bullitt','Lindebjerg','Liv','LOOK',
  'Marin','Mate Bike','MBK','Merida','Momentum','Mondraker',
  'Motobecane','Moustache','Nihola','Nishiki','Norden','Norco',
  'Omnium','Orbea','Pegasus','Pinarello','Principia','Puky','Qio',
  'QWIC','Raleigh','Riese & Müller','Ridley','Royal Cargobike',
  'Santa Cruz','SCO','Scott','Seaside Bike','Silverback','Sparta',
  'Specialized','Stevens','Superior','Tern','Trek','Triobike',
  'Urban Arrow','uVelo','VanMoof','Velo de Ville','Victoria','Wilier',
  'Winther','Woom','Yuba',
];
