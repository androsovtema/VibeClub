/**
 * Проверяет CSP всех публикуемых HTML-страниц.
 * Новая страница в корне или projects/ должна иметь CSP с cloud- и cutover-источниками.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXPECTED_PAGE_COUNT = 18;
const EXCLUDED_DIRECTORIES = new Set(['.git', 'audits', 'docs', 'infra', 'node_modules', 'supabase']);
const REQUIRED_SOURCES = {
  'connect-src': [
    'https://ndhyvspgkelxgqmfmmry.supabase.co',
    'wss://ndhyvspgkelxgqmfmmry.supabase.co',
    'https://api.wedesignerz.com',
    'wss://api.wedesignerz.com',
    'https://stats.wedesignerz.com'
  ],
  'script-src': ['https://stats.wedesignerz.com']
};

async function collectHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        files.push(...await collectHtmlFiles(join(directory, entry.name)));
      }
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(join(directory, entry.name));
    }
  }

  return files;
}

function getDirectiveSources(policy, directive) {
  const value = policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${directive} `));
  return new Set(value ? value.split(/\s+/).slice(1) : []);
}

const pages = await collectHtmlFiles(ROOT);
const errors = [];

if (pages.length !== EXPECTED_PAGE_COUNT) {
  errors.push(`Ожидалось HTML-страниц сайта: ${EXPECTED_PAGE_COUNT}; найдено: ${pages.length}.`);
}

for (const page of pages.sort()) {
  const relativePath = relative(ROOT, page);
  const html = await readFile(page, 'utf8');
  const match = html.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(['"])(.*?)\1/i);

  if (!match) {
    errors.push(`${relativePath}: нет meta Content-Security-Policy.`);
    continue;
  }

  for (const [directive, sources] of Object.entries(REQUIRED_SOURCES)) {
    const values = getDirectiveSources(match[2], directive);
    for (const source of sources) {
      if (!values.has(source)) errors.push(`${relativePath}: в ${directive} нет ${source}.`);
    }
  }
}

if (errors.length) {
  console.error('CSP-проверка не пройдена:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`✓ CSP: ${pages.length} HTML-страниц содержат cloud- и cutover-источники.`);
}
