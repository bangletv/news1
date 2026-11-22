import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const BANNED_STRINGS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bGood News\b/i, label: 'Good News' },
  { pattern: /\bZero Bad News\b/i, label: 'Zero Bad News' },
  { pattern: /\bAI-Powered\b/i, label: 'AI-Powered' },
  { pattern: /AI পরিচালিত/u, label: 'AI পরিচালিত' },
  { pattern: /\bAutomated\b/i, label: 'Automated (self-promotional UI label)' },
  { pattern: /\bTier\s*1\b/i, label: 'Tier 1' },
  { pattern: /\bPriority\s*[1-4]\b/i, label: 'Numeric priority in UI' },
];

export interface BannedFinding {
  file: string;
  line: number;
  label: string;
  excerpt: string;
}

const TARGET_DIRS = ['src/components', 'src/App.tsx', 'src/i18n.ts', 'index.html', 'apps/growth/src/og-card.ts'];

function walkTargets(rootDir: string): string[] {
  const files: string[] = [];
  for (const rel of TARGET_DIRS) {
    const abs = path.join(rootDir, rel);
    try {
      const st = statSync(abs);
      if (st.isFile()) {
        files.push(abs);
      } else if (st.isDirectory()) {
        for (const entry of readdirSync(abs)) {
          const child = path.join(abs, entry);
          if (statSync(child).isFile() && /\.(tsx?|html|astro)$/.test(child)) {
            files.push(child);
          }
        }
      }
    } catch {
      continue;
    }
  }
  return files;
}

export function scanBannedStrings(rootDir = process.cwd()): BannedFinding[] {
  const findings: BannedFinding[] = [];
  const files = walkTargets(rootDir);

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      for (const rule of BANNED_STRINGS) {
        if (rule.pattern.test(lineText)) {
          findings.push({
            file: path.relative(rootDir, file),
            line: i + 1,
            label: rule.label,
            excerpt: lineText.trim().slice(0, 120),
          });
        }
      }
    }
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = scanBannedStrings();
  if (findings.length > 0) {
    console.error('Banned strings detected in UI / cards:');
    console.error(JSON.stringify(findings, null, 2));
    process.exit(1);
  }
  console.log('PASS: Zero banned strings found across UI, HTML, and share cards.');
}
