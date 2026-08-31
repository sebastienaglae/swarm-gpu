import { access, readFile } from 'node:fs/promises';
import { dirname, normalize, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const markdownFiles = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/u)
  .filter(Boolean);
const failures = [];

for (const file of markdownFiles) {
  const source = await readFile(file, 'utf8');
  const links = source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu);
  for (const match of links) {
    const rawTarget = match[1]?.trim();
    if (
      rawTarget === undefined ||
      rawTarget.startsWith('#') ||
      /^(?:https?:|mailto:)/u.test(rawTarget)
    ) {
      continue;
    }
    const pathOnly = decodeURIComponent(rawTarget.replace(/^<|>$/gu, '').split('#')[0] ?? '');
    const target = normalize(resolve(root, dirname(file), pathOnly));
    if (!target.startsWith(root)) {
      failures.push(`${file}: link escapes repository: ${rawTarget}`);
      continue;
    }
    try {
      await access(target);
    } catch {
      failures.push(`${file}: missing target ${rawTarget}`);
    }
  }
}

if (failures.length > 0)
  throw new Error(`Documentation link check failed:\n${failures.join('\n')}`);
process.stdout.write(`Documentation links pass across ${String(markdownFiles.length)} files.\n`);
