import { readFile, readdir, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/u)
  .filter(Boolean);
const failures = [];
const forbiddenTracked = [
  /(?:^|\/)\.env(?:\.|$)/u,
  /\.(?:pem|p12|pfx|key|log|map)$/u,
  /(?:^|\/)dist\//u,
  /(?:^|\/)node_modules\//u,
];
const sensitiveText = [
  { name: 'private Windows user path', pattern: /[A-Z]:\\Users\\[^\\\s]+/u },
  { name: 'private POSIX user path', pattern: /\/Users\/[^/\s]+/u },
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
  { name: 'GitHub token', pattern: /(?:ghp|github_pat)_[A-Za-z0-9_]{20,}/u },
  { name: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/u },
];

for (const file of tracked) {
  if (forbiddenTracked.some((pattern) => pattern.test(file))) {
    failures.push(`forbidden tracked artifact: ${file}`);
  }
  if (['.png', '.gif', '.webm', '.ico'].includes(extname(file).toLowerCase())) continue;
  const content = await readFile(file, 'utf8');
  for (const check of sensitiveText) {
    if (check.pattern.test(content)) failures.push(`${file}: ${check.name}`);
  }
}

const distFiles = await collectFiles('dist').catch(() => []);
if (distFiles.length === 0) failures.push('production dist is missing');
for (const file of distFiles) {
  if (file.endsWith('.map')) failures.push(`production source map present: ${file}`);
}
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
if (packageJson.version !== '1.0.0') failures.push('package version is not 1.0.0');
if (Object.keys(packageJson.dependencies ?? {}).length > 0) {
  failures.push('unexpected production runtime dependencies');
}
for (const required of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md', 'RELEASE_NOTES.md']) {
  if (!tracked.includes(required)) failures.push(`missing tracked release document: ${required}`);
}

if (failures.length > 0) throw new Error(`Release audit failed:\n${failures.join('\n')}`);
const distBytes = await totalBytes(distFiles);
process.stdout.write(
  `Release audit passes: ${String(tracked.length)} tracked files, ${String(distFiles.length)} production files, ${String(distBytes)} dist bytes.\n`,
);

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function totalBytes(files) {
  let bytes = 0;
  for (const file of files) bytes += (await stat(file)).size;
  return bytes;
}
