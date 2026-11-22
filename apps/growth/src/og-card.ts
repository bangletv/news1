import { Resvg } from '@resvg/resvg-js';
import { existsSync } from 'node:fs';
import { renderTypographyCardSvg } from './og-card-svg.ts';

export { renderTypographyCardSvg };

export function renderTypographyCardPng(params: {
  sourceName: string;
  headline: string;
  pillarLabel: string;
}): Buffer {
  const svg = renderTypographyCardSvg(params);
  const candidateFonts = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  ].filter((p) => existsSync(p));

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: {
      fontFiles: candidateFonts,
      loadSystemFonts: true,
      defaultFontFamily: 'DejaVu Sans',
    },
  });
  return Buffer.from(resvg.render().asPng());
}
