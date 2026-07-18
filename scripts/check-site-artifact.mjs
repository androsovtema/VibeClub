/** Проверяет, что в статический release не попало внутреннее содержимое repo. */
import { lstat, readdir, readFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import process from 'node:process';

const root = resolve(process.argv[2] ?? '_site');
const expectedHtmlCount = 18;
const requiredFiles = ['index.html', '404.html', 'robots.txt', 'styles.css'];
const requiredDirectories = ['js', 'css', 'fonts'];
const forbiddenTopLevel = new Set([
  '.git', '.github', '.claude', 'node_modules', 'docs', 'audits', 'supabase',
  'infra', 'scripts', '_site', 'CLAUDE.md', 'AGENTS.md', 'package.json',
  'package-lock.json', 'eslint.config.js', '.stylelintrc.json', '.stylelintignore',
  '.gitignore'
]);
const privateFilePattern = /(?:^|\/)(?:id_(?:rsa|ecdsa|ed25519)|.*\.(?:pem|key|p12|pfx)|.*(?:secret|credential).*)(?:$|\/)/i;
const secretContentPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:SUPABASE_)?SERVICE_ROLE(?:_KEY)?\s*[:=]\s*['"][^'"]+/i;
const forbiddenRuntimePattern = /(?:challenges\.cloudflare\.com|turnstile|ndhyvspgkelxgqmfmmry\.supabase\.co)/i;
const textExtensions = new Set(['.html', '.css', '.js', '.mjs']);
const errors = [];
const htmlFiles = [];

function report(path, message) {
  errors.push(`${relative(root, path) || '.'}: ${message}`);
}

async function walk(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    errors.push(`Не удалось прочитать ${path}: ${error.message}`);
    return;
  }

  for (const entry of entries) {
    const entryPath = resolve(path, entry.name);
    const relativePath = relative(root, entryPath);
    const topLevel = relativePath.split(sep)[0];
    const stat = await lstat(entryPath);

    if (stat.isSymbolicLink()) {
      report(entryPath, 'symbolic link запрещён.');
      continue;
    }
    if (entry.name.startsWith('.')) report(entryPath, 'dotfile или скрытый каталог запрещён.');
    if (forbiddenTopLevel.has(topLevel)) report(entryPath, 'внутренний путь запрещён.');
    if (entry.name.startsWith('.env') || privateFilePattern.test(relativePath)) {
      report(entryPath, 'возможный секрет или служебный ключ запрещён.');
    }

    if (stat.isDirectory()) {
      await walk(entryPath);
      continue;
    }
    if (!stat.isFile()) {
      report(entryPath, 'разрешены только обычные файлы и каталоги.');
      continue;
    }

    if (entry.name.endsWith('.html')) htmlFiles.push(entryPath);
    if (textExtensions.has(entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase())) {
      const content = await readFile(entryPath, 'utf8');
      if (secretContentPattern.test(content)) report(entryPath, 'обнаружен секрет или service_role-маркер.');
      if (forbiddenRuntimePattern.test(content)) {
        report(entryPath, 'обнаружен Cloudflare/Turnstile runtime origin или legacy cloud Supabase host.');
      }
    }
  }
}

try {
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) errors.push(`${root}: ожидается обычный каталог артефакта.`);
} catch (error) {
  errors.push(`Артефакт отсутствует: ${root} (${error.message})`);
}

if (!errors.length) await walk(root);

for (const required of requiredFiles) {
  try {
    const stat = await lstat(resolve(root, required));
    if (!stat.isFile() || stat.isSymbolicLink()) errors.push(`${required}: обязателен обычный файл.`);
  } catch {
    errors.push(`${required}: обязательный файл отсутствует.`);
  }
}

for (const required of requiredDirectories) {
  try {
    const stat = await lstat(resolve(root, required));
    if (!stat.isDirectory() || stat.isSymbolicLink()) errors.push(`${required}: обязателен обычный каталог.`);
  } catch {
    errors.push(`${required}: обязательный каталог отсутствует.`);
  }
}

try {
  const robots = await readFile(resolve(root, 'robots.txt'), 'utf8');
  if (!robots.split(/\r?\n/).includes('Disallow: /')) errors.push('robots.txt: обязателен Disallow: /.');
  if (!/User-agent:\s*TelegramBot\s*[\r\n]+Allow:\s*\//i.test(robots)) {
    errors.push('robots.txt: TelegramBot должен быть разрешён для OG-превью.');
  }
} catch {
  // Отсутствие файла уже добавлено выше.
}

if (htmlFiles.length !== expectedHtmlCount) {
  errors.push(`Ожидалось HTML-страниц: ${expectedHtmlCount}; найдено: ${htmlFiles.length}.`);
}

if (errors.length) {
  console.error('Проверка статического артефакта не пройдена:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`✓ Артефакт чист: ${htmlFiles.length} HTML-страниц, symlink и внутренние файлы отсутствуют.`);
}
