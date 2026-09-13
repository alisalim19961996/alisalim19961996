/**
 * Guided project setup.
 *
 * Connecting a database is the step where a first run actually stalls: the
 * .env file has to exist, a secret has to be generated, the connection string
 * has to be right, and migrations have to run — and when any part of that is
 * wrong, the underlying tools fail with English stack traces that never say
 * which part. This script performs each step and, on failure, names the
 * specific cause in Arabic.
 *
 * Usage:
 *   pnpm setup
 *   pnpm setup --url "postgresql://..." --seed    (non-interactive)
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { stdin, stdout } from 'node:process';

const ENV_PATH = '.env';
const EXAMPLE_PATH = '.env.example';

const ESC = '';
const c = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  red: `${ESC}[31m`,
  green: `${ESC}[32m`,
  yellow: `${ESC}[33m`,
  cyan: `${ESC}[36m`,
};

const say = (msg = '') => console.log(msg);
const ok = (msg) => say(`${c.green}✓${c.reset} ${msg}`);
const warn = (msg) => say(`${c.yellow}!${c.reset} ${msg}`);
const fail = (msg) => say(`${c.red}✗${c.reset} ${msg}`);
const step = (n, msg) =>
  say(`\n${c.bold}${c.cyan}[${n}]${c.reset} ${c.bold}${msg}${c.reset}`);

function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    out[key] = rawValue.replace(/^["']|["']$/g, '');
  }
  return out;
}

function writeEnvValue(text, key, value) {
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  return pattern.test(text)
    ? text.replace(pattern, line)
    : `${text.trimEnd()}\n${line}\n`;
}

/** Turn the driver's error into the cause the user can actually act on. */
function explainConnectionError(error) {
  const message = String(error?.message ?? error);
  const code = error?.code;

  if (code === 'ENOTFOUND' || message.includes('getaddrinfo')) {
    return 'اسم الخادم في الرابط غير صحيح — راجع الجزء الي بعد علامة @';
  }
  if (code === 'ECONNREFUSED') {
    return 'ماكو خادم يستقبل على هذا المنفذ. إذا تستخدم Docker تأكد أنه شغّال: docker compose up -d';
  }
  if (code === 'ETIMEDOUT' || message.includes('timeout')) {
    return 'انتهت مهلة الاتصال — تأكد من الإنترنت، أو أن القاعدة السحابية مو متوقفة';
  }
  if (message.includes('password authentication failed')) {
    return 'كلمة المرور غلط. تأكد أنك بدّلت [YOUR-PASSWORD] بكلمة المرور الحقيقية';
  }
  if (message.includes('does not exist')) {
    return 'اسم قاعدة البيانات في نهاية الرابط مو موجود';
  }
  if (message.includes('SASL') || message.includes('SCRAM')) {
    return 'كلمة المرور ناقصة في الرابط، أو بيها رموز تحتاج ترميز مثل @ أو #';
  }
  if (message.includes('self-signed certificate') || message.includes('SSL')) {
    return 'مشكلة شهادة SSL — جرّب تضيف ?sslmode=require بنهاية الرابط';
  }
  return message;
}

function run(command, args, env = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
}

/**
 * The password as it literally appears in the connection string.
 *
 * Read by hand rather than with `new URL()`, because the whole point is to
 * inspect a string the URL parser may already have misread — which is the bug
 * this catches.
 */
function rawPasswordOf(url) {
  const afterScheme = url.replace(/^postgres(?:ql)?:\/\//i, '');
  const at = afterScheme.lastIndexOf('@');
  if (at === -1) return null;
  const credentials = afterScheme.slice(0, at);
  const colon = credentials.indexOf(':');
  return colon === -1 ? null : credentials.slice(colon + 1);
}

/**
 * Why a password that "looks right" is rejected.
 *
 * Postgres only ever reports "password authentication failed", which is true
 * and useless: it cannot know the password was mangled before it arrived.
 * Two ways that happens, and both look identical from the outside:
 *
 *  - the placeholder was never replaced;
 *  - the password contains a character with a meaning inside a URL. `#` is the
 *    cruel one — everything after it is a fragment, so `abc#123` is sent as
 *    `abc` and nothing anywhere says so.
 */
function passwordProblem(url) {
  const raw = rawPasswordOf(url);
  if (raw === null) return null;

  if (/\[.*\]/.test(raw) || raw.toUpperCase().includes('YOUR-PASSWORD')) {
    return { kind: 'placeholder' };
  }
  if (raw === '') return { kind: 'empty' };

  const offenders = [...new Set([...raw])].filter((ch) => '#?/@:[] '.includes(ch));
  if (offenders.length > 0) return { kind: 'needsEncoding', offenders };

  return null;
}

async function main() {
  say(`${c.bold}إعداد متجر MPS${c.reset}`);
  say(`${c.dim}يجهّز كل شي، ويكولك بالضبط وين المشكلة إذا صارت.${c.reset}`);

  // -- 1. .env ---------------------------------------------------------------
  step(1, 'ملف الإعدادات .env');

  if (!existsSync(ENV_PATH)) {
    if (!existsSync(EXAMPLE_PATH)) {
      fail('ملف .env.example مفقود. تأكد أنك داخل مجلد المشروع.');
      process.exit(1);
    }
    writeFileSync(ENV_PATH, readFileSync(EXAMPLE_PATH, 'utf8'));
    ok('أنشأت ملف .env');
  } else {
    ok('ملف .env موجود');
  }

  let envText = readFileSync(ENV_PATH, 'utf8');
  let env = parseEnv(envText);

  // -- 2. secret -------------------------------------------------------------
  step(2, 'مفتاح تشفير الجلسات');

  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    envText = writeEnvValue(
      envText,
      'BETTER_AUTH_SECRET',
      randomBytes(32).toString('base64'),
    );
    writeFileSync(ENV_PATH, envText);
    ok('ولّدت مفتاحًا جديدًا تلقائيًا');
  } else {
    ok('المفتاح موجود');
  }

  for (const [key, value] of [
    ['BETTER_AUTH_URL', 'http://localhost:3000'],
    ['NEXT_PUBLIC_APP_URL', 'http://localhost:3000'],
  ]) {
    if (!env[key]) {
      envText = writeEnvValue(envText, key, value);
      writeFileSync(ENV_PATH, envText);
      ok(`ضبطت ${key}`);
    }
  }

  env = parseEnv(envText);

  // -- 3. database url -------------------------------------------------------
  step(3, 'رابط قاعدة البيانات');

  const flagIndex = process.argv.indexOf('--url');
  let url = flagIndex !== -1 ? process.argv[flagIndex + 1] : undefined;

  const isPlaceholder = !env.DATABASE_URL || env.DATABASE_URL.includes('USER:PASSWORD');

  if (!url && !isPlaceholder) {
    ok('الرابط موجود في .env');
    url = env.DATABASE_URL;
  }

  if (!url) {
    if (!stdin.isTTY) {
      fail('ماكو رابط قاعدة بيانات.');
      say(`  شغّل: ${c.bold}pnpm setup --url "postgresql://..."${c.reset}`);
      process.exit(1);
    }

    say('');
    say('  محتاج رابط قاعدة بيانات PostgreSQL. عندك خياران:');
    say(
      `  ${c.bold}أ)${c.reset} Supabase مجاني  ${c.dim}— الخطوات في docs/database-setup-ar.md${c.reset}`,
    );
    say(
      `  ${c.bold}ب)${c.reset} Docker على جهازك ${c.dim}— شغّل: docker compose up -d${c.reset}`,
    );
    say('     وبعدها الرابط هو:');
    say(
      `     ${c.dim}postgresql://mps:mps_dev_password@127.0.0.1:5432/mps_dev?schema=public${c.reset}`,
    );
    say('');

    const rl = createInterface({ input: stdin, output: stdout });
    url = (await rl.question('  الصق الرابط هنا: ')).trim();
    rl.close();
  }

  if (!url) {
    fail('ما انلصق أي رابط.');
    process.exit(1);
  }
  if (!/^postgres(ql)?:\/\//.test(url)) {
    fail('الرابط لازم يبدأ بـ postgresql://');
    process.exit(1);
  }
  if (url.toUpperCase().includes('YOUR-PASSWORD')) {
    fail('لازم تبدّل [YOUR-PASSWORD] بكلمة المرور الحقيقية.');
    process.exit(1);
  }

  // -- 4. connection test ----------------------------------------------------
  step(4, 'اختبار الاتصال');

  const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
  const { Client } = await import('pg');
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 15000,
    // Hosted providers terminate TLS with certificates Node does not chain to
    // a local root. Local databases speak plaintext.
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const result = await client.query('select version()');
    const version = String(result.rows[0].version).split(' ').slice(0, 2).join(' ');
    await client.end();
    ok(`الاتصال ناجح — ${version}`);
  } catch (error) {
    fail('فشل الاتصال بقاعدة البيانات.');
    say('');
    say(`  ${c.bold}${c.yellow}السبب:${c.reset} ${explainConnectionError(error)}`);

    // Postgres can only say "authentication failed". These two causes mangle
    // the password before it ever reaches the server, so the server has no way
    // to describe them — but the connection string still does.
    const problem = passwordProblem(url);
    if (problem?.kind === 'placeholder') {
      say('');
      warn('كلمة المرور بعدها النص التجريبي — ما انبدّلت.');
      say('  شيل [YOUR-PASSWORD] وحط كلمة المرور الحقيقية مكانها.');
    } else if (problem?.kind === 'empty') {
      say('');
      warn('ماكو كلمة مرور بالرابط إطلاقًا — المكان بين : و @ فارغ.');
    } else if (problem?.kind === 'needsEncoding') {
      say('');
      warn(`كلمة المرور بيها رموز تكسر الرابط: ${problem.offenders.join(' ')}`);
      say('  الرمز # هو الأخطر: كلشي بعده ينحذف بصمت، فتنرسل كلمة مرور ناقصة.');
      say('');
      say(`  ${c.bold}الحل الأسهل:${c.reset} بدّل كلمة مرور قاعدة البيانات لوحدة`);
      say('  بحروف إنكليزية وأرقام فقط، بدون أي رمز:');
      say(
        `  ${c.dim}Supabase ← Project Settings ← Database ← Reset database password${c.reset}`,
      );
    }

    say('');
    say(`  ${c.dim}الرسالة الأصلية: ${String(error?.message ?? error)}${c.reset}`);
    await client.end().catch(() => {});
    process.exit(1);
  }

  envText = writeEnvValue(envText, 'DATABASE_URL', url);
  writeFileSync(ENV_PATH, envText);
  ok('حفظت الرابط في .env');

  // -- 5. migrations ---------------------------------------------------------
  step(5, 'إنشاء الجداول');

  const migrate = run('npx', ['prisma', 'migrate', 'deploy'], {
    DATABASE_URL: url,
  });
  if (migrate.status !== 0) {
    fail('فشل إنشاء الجداول. الرسالة فوك تشرح السبب.');
    process.exit(1);
  }
  ok('الجداول جاهزة');

  // -- 6. demo data ----------------------------------------------------------
  step(6, 'بيانات تجريبية');

  let wantsSeed = process.argv.includes('--seed');
  if (!wantsSeed && !process.argv.includes('--no-seed') && stdin.isTTY) {
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = await rl.question('  تريد بيانات تجريبية للتجربة؟ (y/n): ');
    rl.close();
    wantsSeed = /^y/i.test(answer.trim());
  }

  if (wantsSeed) {
    const seed = run('npx', ['tsx', 'server/db/seed.ts'], { DATABASE_URL: url });
    if (seed.status !== 0) {
      warn('فشل تحميل البيانات التجريبية، بس الجداول جاهزة.');
    } else {
      ok('البيانات التجريبية جاهزة');
    }
  } else {
    say(`  ${c.dim}تخطّيت البيانات التجريبية.${c.reset}`);
  }

  // -- done ------------------------------------------------------------------
  say('');
  say(`${c.green}${c.bold}كل شي جاهز.${c.reset}`);
  say('');
  say(`  شغّل المشروع:   ${c.bold}pnpm dev${c.reset}`);
  say(`  ثم افتح:        ${c.bold}http://localhost:3000${c.reset}`);
  say('');
  say(`  ${c.dim}لتصفح قاعدة البيانات: pnpm db:studio${c.reset}`);
}

main().catch((error) => {
  fail(String(error?.message ?? error));
  process.exit(1);
});
