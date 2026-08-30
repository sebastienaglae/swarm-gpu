import { execFileSync } from 'node:child_process';

const suite = process.argv[2] ?? 'quick';
const scenario = process.argv[3];
if (!['quick', 'full'].includes(suite)) throw new Error('Suite must be quick or full');

execFileSync('git', ['diff', '--quiet']);
execFileSync('git', ['diff', '--cached', '--quiet']);
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
process.argv = [
  process.argv[0],
  'scripts/stress-phase-07.mjs',
  'http://127.0.0.1:5174/',
  commit,
  suite,
  ...(scenario === undefined ? [] : [scenario]),
];
await import('./stress-phase-07.mjs');
