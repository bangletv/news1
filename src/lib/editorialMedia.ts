export interface EditorialMediaAsset {
  src: string;
  alt: string;
  credit: string;
}

export const EDITORIAL_MEDIA_BY_ITEM_ID: Record<string, EditorialMediaAsset> = {
  item_nasa_europa_clipper: {
    src: '/photos/mars.webp',
    alt: 'Mosaic of Curiosity sample drill holes in Martian rock',
    credit: 'NASA/JPL-Caltech/MSSS',
  },
  item_nasa_atacama_el_nino: {
    src: '/photos/atacama.webp',
    alt: 'Landsat view of the Atacama region in Chile',
    credit: 'NASA Earth Observatory / Michala Garrison, USGS Landsat',
  },
  item_csiro_coral_restoration: {
    src: '/photos/pacific.webp',
    alt: 'Satellite view over the Southwest Pacific Ocean',
    credit: 'NASA Earth Observatory / Lauren Dauphin, MODIS',
  },
  item_un_cop31_climate: {
    src: '/photos/venice.webp',
    alt: 'European coastal observation satellite view of Venice and the Adriatic lagoon',
    credit: 'NASA Earth Observatory / Joshua Stevens; Copernicus Sentinel data, ESA',
  },
};

export const IMAGE_CREDITS_LIST = [
  {
    title: 'Brand wordmark & open-knowledge emblem',
    credit: 'TheOpenSource.news original visual identity (/brand-lockup.webp)',
  },
  {
    title: 'Southwest Pacific satellite imagery',
    credit: 'NASA Earth Observatory / Lauren Dauphin, MODIS (Public Domain)',
  },
  {
    title: 'Atacama Desert Landsat observation',
    credit: 'NASA Earth Observatory / Michala Garrison, USGS Landsat (Public Domain)',
  },
  {
    title: 'Curiosity rover sample drill mosaic',
    credit: 'NASA/JPL-Caltech/MSSS (Public Domain)',
  },
  {
    title: 'Venice & Adriatic coastline observation',
    credit: 'NASA Earth Observatory / Joshua Stevens; modified Copernicus Sentinel data, ESA',
  },
  {
    title: 'Typography share cards (/api/v1/og/:id.png)',
    credit: 'Deterministic code-rendered SVG/PNG typography using system DejaVu fonts. Zero AI-generated imagery.',
  },
];
