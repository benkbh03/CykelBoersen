export const BIKES_PAGE_SIZE = 24;
export const MAP_PAGE_LIMIT = 500;

/* Supabase image transformations kræver Pro-plan.
   Vi bruger den IKKE — originale billeder serves direkte (loading="lazy"
   + browser-side decoding holder dem ude af first-paint kritisk sti). */
export const IMAGE_TRANSFORMS_ENABLED = false;

// Standardiseret farveliste til opret-form og filter
export const BIKE_COLORS = [
  { name: 'Sort',     hex: '#1a1a18', dark: true  },
  { name: 'Hvid',     hex: '#f5f5f0', dark: false },
  { name: 'Grå',      hex: '#9aa0a4', dark: false },
  { name: 'Sølv',     hex: '#c9ccd1', dark: false },
  { name: 'Rød',      hex: '#c8302a', dark: true  },
  { name: 'Blå',      hex: '#2a5fc8', dark: true  },
  { name: 'Grøn',     hex: '#2a8d3a', dark: true  },
  { name: 'Gul',      hex: '#f2c12e', dark: false },
  { name: 'Orange',   hex: '#e67e22', dark: true  },
  { name: 'Lyserød',  hex: '#e8a4c4', dark: false },
  { name: 'Lilla',    hex: '#7a4ec1', dark: true  },
  { name: 'Brun',     hex: '#7a4f2a', dark: true  },
  { name: 'Beige',    hex: '#d8c8a8', dark: false },
];

export const STATIC_PAGE_ROUTES = {
  about: '/om-os',
  terms: '/vilkaar',
  privacy: '/privatlivspolitik',
  contact: '/kontakt',
  'guide-tjek': '/guide/tjek-brugt-cykel',
  cookies: '/cookiepolitik',
};
