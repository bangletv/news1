import path from 'node:path';
import { ApiRepository } from '../apps/api/src/repository.ts';

const DB_PATH = path.resolve(process.cwd(), 'data/osn.sqlite');

function printUsage() {
  console.log('Usage:');
  console.log('  npx tsx scripts/kill-switch.ts status');
  console.log('  npx tsx scripts/kill-switch.ts set <global|source:ID|category:SLUG>');
  console.log('  npx tsx scripts/kill-switch.ts clear <global|source:ID|category:SLUG>');
}

const [, , cmd, scope] = process.argv;
const repo = new ApiRepository(DB_PATH);

if (cmd === 'status') {
  console.log(JSON.stringify(repo.getKillSwitches(), null, 2));
} else if (cmd === 'set' && scope) {
  console.log(JSON.stringify(repo.setKillSwitch(scope, true), null, 2));
} else if (cmd === 'clear' && scope) {
  console.log(JSON.stringify(repo.setKillSwitch(scope, false), null, 2));
} else {
  printUsage();
  process.exit(1);
}
