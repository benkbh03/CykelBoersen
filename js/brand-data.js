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

  // ── Premium racer/MTB internationale ─────────────────────────
  bmc: {
    name: 'BMC',
    country: 'Schweiz',
    founded: 1986,
    tagline: 'Swiss Cycling Technology',
    description: 'BMC (Bicycle Manufacturing Company) er et schweizisk cykelmærke kendt for premium aluminiums- og carbonrammer. Producerer både racer- og mountainbikes brugt af World Tour-hold som Tudor Pro Cycling. Mærket er kendt for sin innovative ICS-stilling (Integrated Cockpit System).',
    popular_models: {
      'Racercykel': ['Teammachine SLR', 'Roadmachine', 'Timemachine'],
      'Mountainbike': ['Fourstroke', 'Trailfox', 'Speedfox'],
      'Gravel': ['URS'],
    },
    typical_price_range: '12.000 – 120.000 kr',
  },
  colnago: {
    name: 'Colnago',
    country: 'Italien',
    founded: 1954,
    tagline: 'Italiensk håndværk siden 1954',
    description: 'Colnago er en italiensk cykellegende grundlagt af Ernesto Colnago i 1954 nær Milano. Mærket har vundet utallige Grand Tours med ryttere som Eddy Merckx og Tadej Pogačar. Karakteristisk klø-blade-logo. C68, V4Rs og V3 er deres flagship-modeller.',
    popular_models: {
      'Racercykel': ['V4Rs', 'C68', 'V3', 'C64'],
      'Gravel': ['G4-X'],
      'Triatlon': ['TT1'],
    },
    typical_price_range: '20.000 – 250.000 kr',
  },
  orbea: {
    name: 'Orbea',
    country: 'Spanien',
    founded: 1840,
    tagline: 'Baskisk cykelhåndværk siden 1840',
    description: 'Orbea er en af verdens ældste cykelproducenter, grundlagt i Baskerlandet, Spanien i 1840 (oprindeligt som våbenproducent). I dag fokuserer mærket på premium racer- og MTB-cykler med Lab-Hub-konfiguration der lader købere customize hver cykel.',
    popular_models: {
      'Racercykel': ['Orca', 'Avant', 'Gain'],
      'Mountainbike': ['Oiz', 'Occam', 'Rallon'],
      'El-cykel': ['Rise', 'Wild'],
    },
    typical_price_range: '8.000 – 100.000 kr',
  },
  wilier: {
    name: 'Wilier Triestina',
    country: 'Italien',
    founded: 1906,
    tagline: 'Storied italiensk racing-arv',
    description: 'Wilier Triestina er et italiensk cykelmærke grundlagt i 1906 i Bassano del Grappa. Berømt for sit karakteristiske bronze-lakerede look og lang historie i Giro d\'Italia. Filante SLR, Zero SLR og Cento10 er deres topmodeller.',
    popular_models: {
      'Racercykel': ['Filante SLR', 'Zero SLR', 'Cento10 SLR', 'Triestina'],
      'Gravel': ['Rave SLR'],
    },
    typical_price_range: '15.000 – 180.000 kr',
  },
  focus: {
    name: 'Focus',
    country: 'Tyskland',
    founded: 1992,
    tagline: 'Tysk cykelteknologi med racing-DNA',
    description: 'Focus blev grundlagt i Tyskland i 1992 af tidligere cyclocross-mester Mike Kluge. Mærket er kendt for racer- og MTB-cykler med direct-mount-tech og fokus på let vægt. Izalco Max, Mares og Jam er deres bedst kendte serier.',
    popular_models: {
      'Racercykel': ['Izalco Max', 'Paralane', 'Atlas'],
      'Cyclocross/Gravel': ['Mares', 'Atlas'],
      'Mountainbike': ['Jam', 'Raven', 'Sam'],
    },
    typical_price_range: '5.000 – 70.000 kr',
  },
  ridley: {
    name: 'Ridley',
    country: 'Belgien',
    founded: 1997,
    tagline: 'Belgisk cyclocross-kongen',
    description: 'Ridley er et belgisk cykelmærke grundlagt i 1997 og særligt kendt for cyclocross- og gravel-cykler. Mærket har sponsoreret World Tour-holdene Lotto-Soudal og har produceret nogle af de mest succesfulde cyclocross-cykler nogensinde (X-Night).',
    popular_models: {
      'Racercykel': ['Helium SLX', 'Noah Fast', 'Fenix'],
      'Cyclocross/Gravel': ['X-Night', 'X-Trail', 'Kanzo'],
    },
    typical_price_range: '8.000 – 80.000 kr',
  },
  'santa-cruz': {
    name: 'Santa Cruz',
    country: 'USA',
    founded: 1993,
    tagline: 'Californisk MTB-kult',
    description: 'Santa Cruz er et amerikansk mountainbike-mærke grundlagt i Californien i 1993. Berømt for VPP (Virtual Pivot Point) ophængssystem og premium carbonrammer. Hightower, Tallboy og Megatower er deres signature trail/enduro-modeller.',
    popular_models: {
      'Mountainbike': ['Hightower', 'Tallboy', 'Megatower', 'Bronson', 'Blur'],
      'El-cykel': ['Heckler', 'Bullit'],
    },
    typical_price_range: '20.000 – 150.000 kr',
  },
  mondraker: {
    name: 'Mondraker',
    country: 'Spanien',
    founded: 2001,
    tagline: 'Spansk MTB-innovation',
    description: 'Mondraker er et spansk mountainbike-mærke grundlagt i 2001. Pionerer inden for "Forward Geometry" og kendt for aggressive enduro- og DH-cykler. Sponsorerede Mondraker Factory Racing-holdet i World Cup DH.',
    popular_models: {
      'Mountainbike': ['Foxy', 'Crafty', 'Summum', 'Raze'],
      'El-cykel': ['Crafty R', 'Level R', 'Chaser'],
    },
    typical_price_range: '15.000 – 110.000 kr',
  },
  lapierre: {
    name: 'Lapierre',
    country: 'Frankrig',
    founded: 1946,
    tagline: 'Fransk cykelarv siden 1946',
    description: 'Lapierre er et fransk cykelmærke grundlagt i Dijon i 1946. Sponsor af Groupama-FDJ World Tour-holdet. Mærket producerer alt fra racer- til MTB- og e-cykler. Xelius, Aircode og Spicy er deres bedst kendte serier.',
    popular_models: {
      'Racercykel': ['Xelius SL', 'Aircode DRS', 'Pulsium'],
      'Mountainbike': ['Spicy', 'Zesty', 'Edge'],
      'El-cykel': ['Overvolt'],
    },
    typical_price_range: '6.000 – 90.000 kr',
  },
  ghost: {
    name: 'Ghost',
    country: 'Tyskland',
    founded: 1993,
    tagline: 'Tysk MTB-kvalitet til alle',
    description: 'Ghost er et tysk cykelmærke grundlagt i 1993 i Bayern. Især kendt for mountainbikes, men producerer også racer- og e-cykler. Mærket har en stærk position i tysk og europæisk marked med god pris-kvalitets-ratio.',
    popular_models: {
      'Mountainbike': ['Lector', 'Kato', 'Square', 'Riot'],
      'El-cykel': ['Hybride'],
      'Citybike': ['Lanao'],
    },
    typical_price_range: '4.000 – 50.000 kr',
  },
  kona: {
    name: 'Kona',
    country: 'Canada',
    founded: 1988,
    tagline: 'Kanadisk MTB-rødder',
    description: 'Kona er et canadisk cykelmærke grundlagt i 1988. Kendt for at lave robuste mountainbikes til everyday-ridere og banebrydende inden for steel-MTB. Process, Honzo og Sutra er deres mest populære modeller.',
    popular_models: {
      'Mountainbike': ['Process', 'Honzo', 'Hei Hei'],
      'Gravel': ['Sutra', 'Rove'],
      'Citybike': ['Dew', 'Coco'],
    },
    typical_price_range: '4.000 – 65.000 kr',
  },
  marin: {
    name: 'Marin',
    country: 'USA',
    founded: 1986,
    tagline: 'MTB-pioner fra Marin County',
    description: 'Marin Bikes blev grundlagt i 1986 i Marin County, Californien — selve fødestedet for mountainbikes. Mærket har produceret nogle af MTB-sportens mest banebrydende modeller. Især kendt for hardtail MTB og gravel-cykler.',
    popular_models: {
      'Mountainbike': ['Bobcat Trail', 'Rift Zone', 'Hawk Hill'],
      'Gravel': ['Headlands', 'Gestalt', 'Nicasio'],
      'Citybike': ['Larkspur', 'Fairfax'],
    },
    typical_price_range: '4.000 – 60.000 kr',
  },
  gt: {
    name: 'GT',
    country: 'USA',
    founded: 1972,
    tagline: 'Amerikansk BMX- og MTB-legende',
    description: 'GT Bicycles er et amerikansk cykelmærke grundlagt i 1972 i Californien. Især kendt for BMX-cykler og mountainbikes med deres karakteristiske triple-triangle frame design. Force, Sensor og Performer er deres ikoniske modeller.',
    popular_models: {
      'Mountainbike': ['Force', 'Sensor', 'Zaskar'],
      'BMX': ['Performer', 'Pro Series'],
      'Gravel': ['Grade'],
    },
    typical_price_range: '4.000 – 50.000 kr',
  },
  bergamont: {
    name: 'Bergamont',
    country: 'Tyskland',
    founded: 1993,
    tagline: 'Tysk allround-cykelkvalitet',
    description: 'Bergamont er et tysk cykelmærke grundlagt i Hamborg i 1993. Producerer alt fra racer- til mountainbikes og e-cykler. Kendt for at levere god kvalitet til moderate priser med fokus på pendlere og motionister.',
    popular_models: {
      'Mountainbike': ['Trailster', 'Contrail', 'Revox'],
      'El-cykel': ['E-Helix', 'E-Horizon'],
      'Citybike': ['Helix', 'Horizon'],
    },
    typical_price_range: '4.000 – 45.000 kr',
  },
  haibike: {
    name: 'Haibike',
    country: 'Tyskland',
    founded: 1995,
    tagline: 'eMTB-pionerer fra Tyskland',
    description: 'Haibike er et tysk cykelmærke grundlagt i 1995 og pioner inden for el-mountainbikes (eMTB). Mærket var blandt de første til at integrere kraftige Bosch-motorer i performance-MTB rammer. SDURO og XDURO er deres bedst kendte serier.',
    popular_models: {
      'El-cykel': ['XDURO Nduro', 'SDURO Trekking', 'AllMtn', 'AllTrack'],
      'Mountainbike': ['Seet', 'Sleek'],
    },
    typical_price_range: '12.000 – 90.000 kr',
  },
  stevens: {
    name: 'Stevens',
    country: 'Tyskland',
    founded: 1991,
    tagline: 'Hamburg-baseret allround-mærke',
    description: 'Stevens er et tysk cykelmærke grundlagt i Hamborg i 1991. Producerer racer-, cyclocross-, MTB- og touring-cykler. Især kendt i Europa for høj kvalitet og pålidelige touring-cykler.',
    popular_models: {
      'Racercykel': ['Izoard', 'Arcalis', 'Ventoux'],
      'Cyclocross/Gravel': ['Super Prestige', 'Camino'],
      'Touring': ['X-Cross', 'Esquire'],
    },
    typical_price_range: '6.000 – 60.000 kr',
  },
  look: {
    name: 'LOOK',
    country: 'Frankrig',
    founded: 1951,
    tagline: 'Franske racer-pionerer',
    description: 'LOOK er et fransk cykelmærke grundlagt i 1951, mest kendt for at have opfundet de moderne click-pedaler i 1984 (brugt af Bernard Hinault i Tour de France). I dag producerer LOOK premium racer- og bane-cykler med karakteristisk asymmetrisk design.',
    popular_models: {
      'Racercykel': ['795 Blade RS', '785 Huez', '795 Light Disc'],
      'Bane': ['T20', 'T96'],
    },
    typical_price_range: '15.000 – 150.000 kr',
  },
  felt: {
    name: 'Felt',
    country: 'USA',
    founded: 1991,
    tagline: 'Amerikansk performance-cykling',
    description: 'Felt er et amerikansk cykelmærke grundlagt i 1991 af Jim Felt. Mærket har historisk fokuseret på triatlon og racer-cykler, og deres tidsstyks-cykler har vundet mange Ironman World Championships.',
    popular_models: {
      'Racercykel': ['AR', 'FR', 'VR'],
      'Triatlon': ['IA Advanced'],
      'Mountainbike': ['Edict', 'Doctrine'],
    },
    typical_price_range: '8.000 – 80.000 kr',
  },

  // ── Europæiske city/touring/e-bike ───────────────────────────
  gazelle: {
    name: 'Gazelle',
    country: 'Holland',
    founded: 1892,
    tagline: 'Hollandsk cykelarv siden 1892',
    description: 'Royal Dutch Gazelle er et af verdens ældste cykelmærker, grundlagt i Dieren, Holland i 1892. Kongelig udnævnelse i 1992. Specialiseret i premium hollandske bycykler, touring og e-cykler — en favorit blandt danske pendlere.',
    popular_models: {
      'Citybike': ['Esprit', 'Tour Populair', 'Miss Grace'],
      'El-cykel': ['Ultimate', 'Arroyo C7+', 'CityZen'],
      'Touring': ['Medeo', 'Tour'],
    },
    typical_price_range: '5.000 – 35.000 kr',
  },
  batavus: {
    name: 'Batavus',
    country: 'Holland',
    founded: 1904,
    tagline: 'Klassisk hollandsk komfort',
    description: 'Batavus er et hollandsk cykelmærke grundlagt i 1904 i Heerenveen. Kendt for klassiske hollandske bycykler i sort med høj komfort og lang holdbarhed. Stadig en af de mest solgte mærker i Holland.',
    popular_models: {
      'Citybike': ['Old Dutch', 'Quip', 'Mambo'],
      'El-cykel': ['Finez E-go', 'Wayz E-go', 'Altura E-go'],
    },
    typical_price_range: '4.000 – 30.000 kr',
  },
  sparta: {
    name: 'Sparta',
    country: 'Holland',
    founded: 1917,
    tagline: 'Hollandsk e-bike-spcialist',
    description: 'Sparta er et hollandsk cykelmærke grundlagt i 1917 og en af pionererne inden for el-cykler i Europa. Især kendt for komfortable e-bikes til pendling med integrerede batterier og god rækkevidde.',
    popular_models: {
      'El-cykel': ['F8e', 'M8b', 'R20e'],
      'Citybike': ['Pick-Up'],
    },
    typical_price_range: '8.000 – 35.000 kr',
  },
  koga: {
    name: 'Koga',
    country: 'Holland',
    founded: 1974,
    tagline: 'Hollandsk premium touring',
    description: 'Koga er et hollandsk cykelmærke grundlagt i 1974, kendt for premium touring- og trekking-cykler. Cyklerne kan customizes med "Signature"-konfiguration. Yderst populære blandt pendlere og langtursryttere.',
    popular_models: {
      'Touring': ['WorldTraveller', 'Denham', 'Pace'],
      'El-cykel': ['E-Worldtraveller', 'E-Inspire'],
      'Racercykel': ['Kimera'],
    },
    typical_price_range: '10.000 – 60.000 kr',
  },
  brompton: {
    name: 'Brompton',
    country: 'UK',
    founded: 1976,
    tagline: 'Britisk foldecykel-ikon',
    description: 'Brompton er en britisk cykelproducent grundlagt i London i 1976. Verdens mest kendte foldecykel — kompakt design der folder ned til en bærbar pakke. Håndlavet i England. P-line, C-line og T-line er deres modeller.',
    popular_models: {
      'Foldecykel': ['C Line Explore', 'P Line Urban', 'T Line One', 'Electric C Line'],
    },
    typical_price_range: '8.000 – 35.000 kr',
  },
  'riese-mueller': {
    name: 'Riese & Müller',
    country: 'Tyskland',
    founded: 1993,
    tagline: 'Premium tyske e-bikes',
    description: 'Riese & Müller er en tysk cykelproducent grundlagt i 1993, kendt for premium e-cykler i topkvalitet. Specialiseret i e-cargobikes (Load, Packster), e-foldecykler (Birdy) og high-end e-trekking-cykler. Ofte topscorer i tyske e-bike-tests.',
    popular_models: {
      'El-cargobike': ['Load 60', 'Load 75', 'Packster 70'],
      'El-cykel': ['Charger4', 'Nevo', 'Roadster'],
      'Foldecykel': ['Birdy'],
    },
    typical_price_range: '25.000 – 80.000 kr',
  },
  moustache: {
    name: 'Moustache',
    country: 'Frankrig',
    founded: 2011,
    tagline: 'Franske premium e-bikes',
    description: 'Moustache Bikes er et fransk cykelmærke grundlagt i 2011 med eksklusiv fokus på e-cykler. Kendt for elegant fransk design, integrerede batterier og høj byggekvalitet. Lundi, Samedi og Friday er deres modeller.',
    popular_models: {
      'El-cykel': ['Friday 28', 'Samedi 28', 'Lundi 26', 'Dimanche'],
    },
    typical_price_range: '15.000 – 50.000 kr',
  },
  liv: {
    name: 'Liv',
    country: 'Taiwan',
    founded: 2008,
    tagline: 'Cykler designet til kvinder',
    description: 'Liv er Giants søsterbrand, grundlagt i 2008 som verdens første cykelmærke dedikeret til kvinder. Cyklerne er designet og fittet specifikt til kvindelig anatomi. Sponsorerer Liv Racing TeqFind World Tour-holdet.',
    popular_models: {
      'Racercykel': ['Avail', 'EnviLiv', 'Langma'],
      'Mountainbike': ['Pique', 'Embolden', 'Intrigue'],
      'El-cykel': ['Thrive E+', 'Embolden E+'],
    },
    typical_price_range: '5.000 – 70.000 kr',
  },
  raleigh: {
    name: 'Raleigh',
    country: 'UK',
    founded: 1887,
    tagline: 'Britisk cykelarv siden 1887',
    description: 'Raleigh er et engelsk cykelmærke grundlagt i Nottingham i 1887. Var i flere årtier verdens største cykelproducent og ikonisk britisk brand. I dag fokuserer mærket på pendlercykler, foldbike og e-cykler.',
    popular_models: {
      'Citybike': ['Strada', 'Pioneer', 'Pop'],
      'El-cykel': ['Trace e', 'Motus', 'Stride'],
      'Foldecykel': ['Stowaway'],
    },
    typical_price_range: '4.000 – 30.000 kr',
  },
  tern: {
    name: 'Tern',
    country: 'Taiwan',
    founded: 2011,
    tagline: 'Innovative foldebare cykler',
    description: 'Tern Bicycles er et taiwanesisk cykelmærke grundlagt i 2011 med specialisering i foldecykler og kompakte e-cargobikes. Især kendt for "GSD" — en kompakt el-cargobike der har vundet flere designpriser.',
    popular_models: {
      'Foldecykel': ['Verge', 'Vektron', 'Link'],
      'El-cargobike': ['GSD', 'HSD', 'Quick Haul'],
    },
    typical_price_range: '8.000 – 45.000 kr',
  },
  'mate-bike': {
    name: 'Mate Bike',
    country: 'Danmark',
    founded: 2016,
    tagline: 'Danske el-foldecykler',
    description: 'Mate Bike (nu Mate.bike) er et dansk/britisk cykelmærke grundlagt i 2016 af Mate-brødrene fra Aarhus. Berømt for crowdfunding-rekorder og deres signature el-foldecykler "Mate X" og "Mate City".',
    popular_models: {
      'El-cykel': ['Mate X', 'Mate City', 'Mate S', 'Mate SUV'],
    },
    typical_price_range: '10.000 – 25.000 kr',
  },

  // ── Cargobikes ────────────────────────────────────────────────
  'christiania-bikes': {
    name: 'Christiania Bikes',
    country: 'Danmark',
    founded: 1984,
    tagline: 'Den originale ladcykel fra København',
    description: 'Christiania Bikes er det danske ikoniske ladcykel-mærke grundlagt i Christiania i 1984. Pionerer inden for moderne ladcykler og en dansk klassiker for familiekørsel. Bygges stadig håndværksmæssigt i København.',
    popular_models: {
      'Ladcykel': ['Light', 'Classic', 'Model T'],
      'El-cykel': ['EL Light', 'EL Classic', 'EL Model T'],
    },
    typical_price_range: '12.000 – 50.000 kr',
  },
  'larry-vs-harry-bullitt': {
    name: 'Larry vs Harry / Bullitt',
    country: 'Danmark',
    founded: 2007,
    tagline: 'Hurtige danske cargobikes',
    description: 'Larry vs Harry blev grundlagt i København i 2007 og producerer den ikoniske "Bullitt" cargobike — en lang, slank og hurtig en-styggig cargobike der har vundet kultstatus blandt cykelbude og familiær. Kendt for høj hastighed og stivt aluminium-stel.',
    popular_models: {
      'Ladcykel': ['Bullitt Clockwork', 'Bullitt Honeycomb', 'Bluebird'],
      'El-cykel': ['Bullitt E-6100', 'Bullitt E-Bullitt'],
    },
    typical_price_range: '18.000 – 55.000 kr',
  },
  babboe: {
    name: 'Babboe',
    country: 'Holland',
    founded: 2005,
    tagline: 'Familievenlige hollandske ladcykler',
    description: 'Babboe er et hollandsk cargobike-mærke grundlagt i 2005, specifikt designet til familier med børn. Cyklerne har stor trækassel forme, god komfort og konkurrencedygtige priser.',
    popular_models: {
      'Ladcykel': ['Big', 'Curve', 'Mini', 'Pro Bike'],
      'El-cykel': ['City-E', 'Big-E', 'Curve-E'],
    },
    typical_price_range: '10.000 – 35.000 kr',
  },
  'urban-arrow': {
    name: 'Urban Arrow',
    country: 'Holland',
    founded: 2010,
    tagline: 'Premium hollandske e-cargobikes',
    description: 'Urban Arrow er et hollandsk cargobike-mærke grundlagt i 2010, fokuseret på premium e-cargobikes med EPP-skum kasse til komfort og let vægt. Bosch-motor som standard. Populær blandt familier og cykelbude.',
    popular_models: {
      'El-cargobike': ['Family', 'Cargo XL', 'Shorty', 'Tender'],
    },
    typical_price_range: '30.000 – 60.000 kr',
  },
  'butchers-bicycles': {
    name: 'Butchers & Bicycles',
    country: 'Danmark',
    founded: 2013,
    tagline: 'Lænende danske 3-hjulede cargobikes',
    description: 'Butchers & Bicycles er et dansk cargobike-mærke grundlagt i 2013 i København. Kendt for deres unikke "Mk1" og "Mk1-E" — 3-hjulede ladcykler der kan læne sig (TiltingTrike) for bedre kurvekørsel. Designet i Danmark.',
    popular_models: {
      'Ladcykel': ['Mk1', 'Mk1-E Vario', 'Mk1-E Vans'],
    },
    typical_price_range: '35.000 – 70.000 kr',
  },
  triobike: {
    name: 'Triobike',
    country: 'Danmark',
    founded: 2005,
    tagline: 'Innovative danske cargo-løsninger',
    description: 'Triobike er et dansk cargobike-mærke grundlagt i 2005. Berømt for "Mono" og "Boxter" — 2- og 3-hjulede ladcykler i moderne dansk design. Lavet i København.',
    popular_models: {
      'Ladcykel': ['Mono', 'Boxter', 'Cargo Big'],
      'El-cykel': ['Mono E', 'Boxter E'],
    },
    typical_price_range: '25.000 – 55.000 kr',
  },
  nihola: {
    name: 'Nihola',
    country: 'Danmark',
    founded: 1998,
    tagline: 'Klassisk dansk 3-hjulet ladcykel',
    description: 'Nihola er en dansk ladcykel-producent grundlagt i 1998 i København. Specialiseret i klassiske 3-hjulede ladcykler med trækasse foran — pålidelig og populær blandt familier til daginstitutionsruter.',
    popular_models: {
      'Ladcykel': ['Family', '4.0', 'Cigar', 'Twin'],
      'El-cykel': ['Family E', '4.0 E'],
    },
    typical_price_range: '18.000 – 45.000 kr',
  },
  winther: {
    name: 'Winther',
    country: 'Danmark',
    founded: 1934,
    tagline: 'Dansk cykelhåndværk siden 1934',
    description: 'Winther er et dansk cykelmærke grundlagt i 1934. Kendt for høj kvalitet i børnecykler og ladcykler. Især deres "Donkey"-serie af ladcykler og "Wallaroo"-børnecykler er populære i danske husstande.',
    popular_models: {
      'Ladcykel': ['Donkey', 'Cargoo'],
      'Børnecykel': ['Wallaroo', 'Joey'],
    },
    typical_price_range: '6.000 – 35.000 kr',
  },

  // ── Børnecykler ──────────────────────────────────────────────
  puky: {
    name: 'Puky',
    country: 'Tyskland',
    founded: 1949,
    tagline: 'Tyske kvalitets-børnecykler siden 1949',
    description: 'Puky er et tysk børnecykel-mærke grundlagt i 1949 i Wülfrath. Kendt for ekstrem holdbarhed og sikre løbecykler (Pukylino, LR M) samt små cykler designet specifikt til børnehjøjde og -anatomi.',
    popular_models: {
      'Børnecykel': ['Cyke', 'Z2', 'ZL 12', 'Steel 16'],
      'Løbecykel': ['Pukylino', 'LR M', 'LR Light'],
    },
    typical_price_range: '1.500 – 6.000 kr',
  },
  woom: {
    name: 'Woom',
    country: 'Østrig',
    founded: 2013,
    tagline: 'Letvægts børnecykler fra Østrig',
    description: 'Woom er et østrigsk børnecykel-mærke grundlagt i 2013. Specialiseret i ekstremt lette aluminiums-børnecykler designet specifikt til barnets vægt og målefolde. Deres "Woom Up" e-MTB var verdens første el-cykel til børn.',
    popular_models: {
      'Børnecykel': ['Woom 1', 'Woom 2', 'Woom 3', 'Woom 4', 'Woom 5'],
      'Løbecykel': ['Woom 1'],
      'Mountainbike': ['Woom OFF', 'Woom UP'],
    },
    typical_price_range: '2.000 – 12.000 kr',
  },
  'frog-bikes': {
    name: 'Frog Bikes',
    country: 'UK',
    founded: 2013,
    tagline: 'Letvægts britiske børnecykler',
    description: 'Frog Bikes er et britisk børnecykel-mærke grundlagt i 2013. Designet til at være ekstremt lette og dimensioneret efter benlængde frem for alder. Populære blandt forældre der vil have deres børn på rigtige cykler tidligt.',
    popular_models: {
      'Børnecykel': ['Frog 40', 'Frog 44', 'Frog 48', 'Frog 53', 'Frog 62'],
      'Mountainbike': ['MTB 62', 'MTB 69'],
    },
    typical_price_range: '2.500 – 8.000 kr',
  },

  // ── Danske hverdags-mærker ──────────────────────────────────
  avenue: {
    name: 'Avenue',
    country: 'Danmark',
    founded: 1923,
    tagline: 'Danske kvalitetscykler i 100+ år',
    description: 'Avenue er et dansk cykelmærke grundlagt i 1923. Producerer pålidelige hverdags-, transport- og el-cykler til den danske familie. Kendt for god kvalitet til moderat pris og bredt forhandlernet i Danmark.',
    popular_models: {
      'Citybike': ['Broadway', 'Roma', 'Aalborg'],
      'El-cykel': ['Broadway E', 'Florence E'],
    },
    typical_price_range: '3.500 – 25.000 kr',
  },
  principia: {
    name: 'Principia',
    country: 'Danmark',
    founded: 1991,
    tagline: 'Danske racer- og MTB-cykler',
    description: 'Principia er et dansk cykelmærke grundlagt i 1991. Specialiserer sig i racer-, gravel- og mountainbikes, samt e-cykler. En af de få danske mærker med rigtig sports-orientering.',
    popular_models: {
      'Racercykel': ['RSE', 'REX'],
      'Mountainbike': ['Evoke', 'Direkte'],
      'El-cykel': ['Onyx', 'Pulse'],
    },
    typical_price_range: '5.000 – 50.000 kr',
  },
  sco: {
    name: 'SCO',
    country: 'Danmark',
    founded: 1948,
    tagline: 'Klassisk dansk transportcykel',
    description: 'SCO (Smith & Co.) er et dansk cykelmærke grundlagt i 1948. Producerer pålidelige hverdags- og transportcykler i klassisk dansk design — en favorit blandt danske pendlere og studerende.',
    popular_models: {
      'Citybike': ['Premium', 'Active', 'Beachcruiser'],
      'El-cykel': ['Premium E', 'Roma E'],
    },
    typical_price_range: '2.500 – 18.000 kr',
  },
};

// Brand-aliaser (forskellige stavemåder → samme slug)
const ALIASES = {
  'cervelo': 'cervélo',
  'specialised': 'specialized',
  'riese-müller': 'riese-mueller',
  'riese-and-mueller': 'riese-mueller',
  'larry-vs-harry': 'larry-vs-harry-bullitt',
  'bullitt': 'larry-vs-harry-bullitt',
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
