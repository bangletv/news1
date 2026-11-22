import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export interface AiImageFinding {
  file: string;
  reason: string;
}

const BANNED_PACKAGES = [
  'openai',
  'replicate',
  'stability-sdk',
  '@fal-ai/client',
  'midjourney',
];

const BANNED_IMAGE_PATTERNS: { rx: RegExp; reason: string }[] = [
  { rx: /\bgenerateImages\b/, reason: 'Gemini generateImages API call detected' },
  { rx: /gemini-[a-z0-9.-]*image/i, reason: 'Image-generation model identifier detected' },
  { rx: /nano-banana/i, reason: 'Image-generation model identifier detected' },
  { rx: /\bdall-e\b/i, reason: 'DALL-E image-generation reference detected' },
  { rx: /\bstable-diffusion\b/i, reason: 'Stable Diffusion image-generation reference detected' },
];

function listCodeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === 'tests') {
      continue;
    }
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) listCodeFiles(full, out);
    else if (/\.(ts|tsx|js|mjs|json)$/.test(entry)) out.push(full);
  }
  return out;
}

export function runAiImageBanAudit(rootDir = process.cwd()): AiImageFinding[] {
  const findings: AiImageFinding[] = [];
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  for (const dep of [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]) {
    if (BANNED_PACKAGES.includes(dep)) {
      findings.push({ file: 'package.json', reason: `Prohibited image-generation SDK dependency: ${dep}` });
    }
  }

  for (const file of listCodeFiles(rootDir)) {
    const content = readFileSync(file, 'utf8');
    for (const rule of BANNED_IMAGE_PATTERNS) {
      if (rule.rx.test(content)) {
        findings.push({ file: path.relative(rootDir, file), reason: rule.reason });
      }
    }
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = runAiImageBanAudit();
  if (findings.length > 0) {
    console.error('AI image ban check FAILED:');
    console.error(JSON.stringify(findings, null, 2));
    process.exit(1);
  }
  console.log('PASS: Zero AI image generation SDKs or calls detected.');
}
