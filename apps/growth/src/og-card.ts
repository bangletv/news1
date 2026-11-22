import { Resvg } from '@resvg/resvg-js';
import { existsSync } from 'node:fs';

function escapeSvg(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapHeadline(headline: string, maxCharsPerLine = 34, maxLines = 4): string[] {
  const words = headline.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}

export function renderTypographyCardSvg(params: {
  sourceName: string;
  headline: string;
  pillarLabel: string;
}): string {
  const lines = wrapHeadline(params.headline);
  const lineNodes = lines
    .map(
      (line, idx) =>
        `<text x="96" y="${275 + idx * 66}" font-family="DejaVu Serif, Georgia, serif" font-size="46" font-weight="700" fill="#132E30">${escapeSvg(line)}</text>`
    )
    .join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#112E2E" />
  <rect x="44" y="44" width="1112" height="542" rx="8" fill="#FAF9F6" stroke="#D7DED8" stroke-width="2" />
  <rect x="44" y="44" width="1112" height="12" fill="#116351" />
  <rect x="96" y="106" width="36" height="4" fill="#DDBC75" />
  <text x="148" y="114" font-family="DejaVu Sans, sans-serif" font-size="21" font-weight="700" letter-spacing="2" fill="#116351">${escapeSvg(params.sourceName.toUpperCase())}  ·  ${escapeSvg(params.pillarLabel.toUpperCase())}</text>
  <line x1="96" y1="152" x2="1104" y2="152" stroke="#D7DED8" stroke-width="1.5" />
  ${lineNodes}
  <line x1="96" y1="510" x2="1104" y2="510" stroke="#D7DED8" stroke-width="1.5" />
  <text x="96" y="548" font-family="DejaVu Sans, sans-serif" font-size="20" font-weight="700" fill="#132E30">TheOpenSource.news</text>
  <text x="1104" y="548" text-anchor="end" font-family="DejaVu Sans, sans-serif" font-size="18" fill="#506560">Verified Institutional Dispatch</text>
</svg>`;
}

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
