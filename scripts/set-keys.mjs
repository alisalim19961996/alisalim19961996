/**
 * Fill in the optional keys without editing .env by hand.
 *
 * Written after six rounds of a setup that kept failing on the file rather
 * than on the values: a copy-paste artefact in front of a variable name, a
 * value pasted outside the quotes, the wrong file edited, the right file left
 * unsaved. None of that is the owner being careless — a dotenv file is an
 * unforgiving format with no feedback until something else breaks.
 *
 * So the file is never touched by hand: this asks for one value at a time,
 * says immediately whether it looks right, writes it in the correct place, and
 * then runs the live check. Pressing Enter keeps whatever is already there.
 *
 * Usage:  pnpm keys
 */
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { copyFileSync } from 'node:fs';
import {
  ENV_PATH,
  assertNoKeysLost,
  parseEnv,
  readEnvFile,
  saveEnvFile,
  writeEnvValue,
} from './lib/env-file.mjs';

const BACKUP_PATH = '.env.bak';

const ESC = String.fromCharCode(27);
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
const ok = (msg) => say(`  ${c.green}OK${c.reset}  ${msg}`);
const warn = (msg) => say(`  ${c.yellow}--${c.reset}  ${msg}`);
const bad = (msg) => say(`  ${c.red}XX${c.reset}  ${msg}`);
const hint = (msg) => say(`      ${c.dim}${msg}${c.reset}`);

function mask(value) {
  if (!value) return `${c.dim}(فارغ){c.reset}`.replace('{c.reset}', c.reset);
  if (value.length <= 12) return `${value.slice(0, 2)}...${value.slice(-2)}`;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

/**
 * The four optional values, each with the one check that catches the mistake
 * people actually make — not a full validation, which the live check does for
 * real a moment later.
 */
const KEYS = [
  {
    name: 'SUPABASE_URL',
    label: 'رابط مشروع Supabase',
    where: 'Supabase ← Project Settings ← Data API ← Project URL',
    example: 'https://xxxxxxxx.supabase.co',
    check(value) {
      if (!/^https:\/\//.test(value)) return 'لازم يبدي بـ https://';
      if (value.endsWith('/')) return 'شيل الـ / من الآخر';
      if (!value.includes('supabase.')) return 'ما يشبه رابط Supabase';
      return null;
    },
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    label: 'المفتاح السري لـ Supabase',
    where:
      'Supabase ← Project Settings ← API keys ← Secret keys (أو تبويب Legacy ← service_role)',
    example: 'sb_secret_...  أو  eyJhbGci...',
    secret: true,
    check(value) {
      // The publishable key sits directly above the secret one on that page,
      // and copying it is the single most common mistake here.
      if (value.startsWith('sb_publishable_') || value.startsWith('sb_pub')) {
        return 'هذا المفتاح العام (publishable) — ما يقدر يرفع. خذ اللي تحته: Secret';
      }
      if (value.length < 20) return 'قصير جدًا — يبين ناقص';
      return null;
    },
  },
  {
    name: 'DEMO_ADMIN_PASSWORD',
    label: 'كلمة مرور حسابات التجربة',
    where: 'إنت تختارها — للتطوير فقط، تُستعمل لـ admin@mps.local',
    example: 'MpsAdmin2026',
    afterNote: 'شغّل  pnpm db:seed  حتى تنطبّق، بعدها ادخل بـ admin@mps.local',
    check(value) {
      if (value.length < 8) return 'لازم 8 حروف على الأقل';
      return null;
    },
  },
  {
    name: 'GOOGLE_CLIENT_ID',
    label: 'معرّف Google OAuth',
    where: 'Google Cloud ← APIs & Services ← Credentials ← OAuth client',
    example: '1234-abcd.apps.googleusercontent.com',
    check(value) {
      if (!value.endsWith('.apps.googleusercontent.com')) {
        return 'عادة ينتهي بـ .apps.googleusercontent.com';
      }
      return null;
    },
  },
  {
    name: 'GOOGLE_CLIENT_SECRET',
    label: 'السر لنفس الـ OAuth client',
    where: 'نفس الصفحة، نفس الـ client',
    example: 'GOCSPX-...',
    secret: true,
    check(value) {
      if (value.length < 10) return 'قصير جدًا — يبين ناقص';
      return null;
    },
  },
];

async function main() {
  say(`${c.bold}تعبئة المفاتيح الاختيارية${c.reset}`);
  say(`${c.dim}اضغط Enter بدون كتابة أي شي حتى تترك القيمة مثل ما هي.${c.reset}`);
  say(`${c.dim}اضغط Ctrl+C بأي لحظة للخروج بدون حفظ.${c.reset}`);
  say('');
  say(`  ${c.bold}اللصق بالترمنال:${c.reset}`);
  hint('Windows Terminal / PowerShell : كليك يمين، أو Ctrl+Shift+V');
  hint('Git Bash                      : كليك يمين ← Paste');

  let text = readEnvFile();
  if (text === null) {
    say('');
    bad('ماكو ملف .env.');
    hint('شغّل: pnpm setup');
    process.exitCode = 1;
    return;
  }

  if (!stdin.isTTY) {
    bad('هذا الأمر يحتاج ترمنال تفاعلي.');
    process.exitCode = 1;
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  let changed = 0;

  /**
   * Ctrl+D closes stdin, and readline answers that by rejecting with an
   * AbortError — which Node prints as a stack trace. Someone who has just
   * decided to stop should not be shown a crash.
   */
  const ask = async (question) => {
    try {
      return (await rl.question(question)).trim();
    } catch {
      return null;
    }
  };

  for (const key of KEYS) {
    const current = parseEnv(text)[key.name] ?? '';

    say('');
    say(`${c.bold}${c.cyan}${key.label}${c.reset} ${c.dim}(${key.name})${c.reset}`);
    hint(`من وين: ${key.where}`);
    hint(`الشكل : ${key.example}`);
    say(
      current
        ? `      الحالي : ${key.secret ? mask(current) : current}`
        : `      الحالي : ${c.dim}(فارغ){c.reset}`.replace('{c.reset}', c.reset),
    );

    const answer = await ask('  الصق القيمة (أو Enter للتخطي): ');
    if (answer === null) {
      say('');
      warn('انتهى الإدخال — وقفنا هنا.');
      break;
    }
    if (answer === '') {
      warn('تُركت مثل ما هي.');
      continue;
    }

    // Quotes are added by the writer, so a value pasted with its own quotes
    // would otherwise be stored with them and fail everywhere silently.
    const value = answer.replace(/^["']|["']$/g, '').trim();

    const problem = key.check(value);
    if (problem) {
      bad(problem);
      const again = await ask('  تريد تحفظها بأي حال؟ (y/N): ');
      if (again?.toLowerCase() !== 'y') {
        warn('ما انحفظت.');
        continue;
      }
    }

    /*
      A copy before the first change, because this tool is the only thing
      between the owner and their database URL — and it has damaged that file
      once already, by gluing two variables onto one line on a CRLF file. The
      backup is what makes the next bug an inconvenience instead of an evening.
    */
    if (changed === 0) {
      copyFileSync(ENV_PATH, BACKUP_PATH);
      hint(`نسخة احتياطية: ${BACKUP_PATH}`);
    }

    const next = writeEnvValue(text, key.name, value);
    try {
      assertNoKeysLost(text, next);
    } catch (error) {
      bad('وقفنا قبل الحفظ — الكتابة كانت راح تضيّع متغيّرات.');
      hint(error instanceof Error ? error.message : String(error));
      hint(`ملفك ما انلمس. النسخة الاحتياطية: ${BACKUP_PATH}`);
      process.exitCode = 1;
      rl.close();
      return;
    }

    text = next;
    saveEnvFile(text);
    changed += 1;
    ok(`انحفظت بـ ${ENV_PATH}`);
    if (key.afterNote) hint(key.afterNote);
  }

  rl.close();

  say('');
  if (changed === 0) {
    warn('ما تغيّر أي شي.');
    return;
  }
  ok(`حفظت ${changed} قيمة.`);
  say('');
  say(`${c.bold}${c.cyan}نفحصها الآن على الحقيقي...${c.reset}`);
  say('');

  // Writing a value proves nothing — the point is whether it works.
  const result = spawnSync('node', ['scripts/check-services.mjs'], {
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 0;
}

await main();
