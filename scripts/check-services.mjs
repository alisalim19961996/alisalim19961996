/**
 * Prove the four optional keys actually work — without anyone reading them.
 *
 * A key that is present but wrong fails at the worst possible moment: the
 * owner clicks "upload" in front of a real product and gets a red line, or a
 * customer is bounced by Google with `redirect_uri_mismatch`. Both are silent
 * until then, and neither error says which of the four values is at fault.
 *
 * So this does the real thing: it uploads a file to Supabase and deletes it
 * again, and it asks Google whether the client id and secret are a pair.
 * Values are only ever shown masked, so the output is safe to look at, screen
 * share, or paste anywhere.
 *
 * Usage:  pnpm check:services
 */
import { existsSync, readFileSync } from 'node:fs';

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
const title = (msg) => say(`\n${c.bold}${c.cyan}${msg}${c.reset}`);

/**
 * Enough of a value to recognise it, never enough to use it.
 *
 * The whole point of this script is that its output is safe to share, so a
 * secret must not be reconstructible from what it prints.
 */
function mask(value) {
  if (!value) return '(فارغ)';
  if (value.length <= 12) return `${value.slice(0, 2)}...${value.slice(-2)}`;
  return `${value.slice(0, 6)}...${value.slice(-4)} (${value.length} حرف)`;
}

function readEnv() {
  if (!existsSync('.env')) return null;
  const env = {};
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    env[match[1]] = quoted ? value.slice(1, -1) : value;
  }
  return env;
}

/** The smallest thing that is unmistakably a PNG: one transparent pixel. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk' +
    'YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function checkSupabase(env) {
  title('Supabase Storage — رفع الصور');

  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = env.SUPABASE_STORAGE_BUCKET?.trim() || 'product-images';

  if (!url && !key) {
    warn('غير مهيّأ — زر "ارفع صورة" ما راح يظهر باللوحة.');
    hint('الموقع يشتغل عادي؛ تكتب مسارات الصور يدويًا. راجع docs/extending-ar.md §4.6');
    return 'skipped';
  }
  if (!url || !key) {
    bad(`ناقص نصه: ${url ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_URL'} مو موجود.`);
    hint('لازم الاثنين مع بعض — واحد بدون الثاني ما ينفع.');
    return 'failed';
  }

  say(`      SUPABASE_URL              = ${url}`);
  say(`      SUPABASE_SERVICE_ROLE_KEY = ${mask(key)}`);
  say(`      SUPABASE_STORAGE_BUCKET   = ${bucket}`);

  if (url.endsWith('/')) {
    bad('SUPABASE_URL ينتهي بـ / — شيلها.');
    return 'failed';
  }

  const objectPath = `_healthcheck/${Date.now()}.png`;
  const endpoint = `${url}/storage/v1/object/${bucket}/${objectPath}`;

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'image/png',
        'x-upsert': 'false',
      },
      body: ONE_PIXEL_PNG,
    });
  } catch (error) {
    bad('ما كدرنا نوصل للسيرفر إطلاقًا.');
    hint(`السبب: ${error.message}`);
    hint('تأكد من SUPABASE_URL ومن اتصال الإنترنت.');
    return 'failed';
  }

  if ([400, 401, 403].includes(response.status)) {
    bad(`المفتاح مرفوض (${response.status}).`);
    hint('تأكد أنك نسخت مفتاح service_role — مو anon ولا publishable.');
    hint('Supabase ← Project Settings ← API keys ← service_role');
    return 'failed';
  }
  if (response.status === 404) {
    bad(`ماكو bucket اسمه "${bucket}".`);
    hint('Supabase ← Storage ← تأكد من الاسم، أو صحّح SUPABASE_STORAGE_BUCKET.');
    return 'failed';
  }
  if (!response.ok) {
    bad(`السيرفر رد ${response.status}.`);
    hint((await response.text().catch(() => '')).slice(0, 200));
    return 'failed';
  }

  ok('الرفع اشتغل.');

  // Clean up after ourselves: a health check that leaves litter behind is a
  // health check nobody runs twice.
  const deleted = await fetch(endpoint, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${key}` },
  }).catch(() => null);

  if (deleted?.ok) ok('والحذف اشتغل — الصلاحيات كاملة وصحيحة.');
  else warn(`ملف الفحص ما انحذف؛ امسحه يدويًا: ${bucket}/${objectPath}`);

  ok('جاهز: زر "ارفع صورة" راح يشتغل باللوحة.');
  return 'passed';
}

async function checkGoogle(env) {
  title('Google — تسجيل الدخول');

  const id = env.GOOGLE_CLIENT_ID?.trim();
  const secret = env.GOOGLE_CLIENT_SECRET?.trim();
  const siteUrl = (env.BETTER_AUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
  const redirectUri = `${siteUrl}/api/auth/callback/google`;

  if (!id && !secret) {
    warn('غير مهيّأ — زر "تابع بحساب Google" ما راح يظهر.');
    hint('الموقع يشتغل عادي بالإيميل وكلمة المرور. راجع docs/extending-ar.md §9.6');
    return 'skipped';
  }
  if (!id || !secret) {
    bad(`ناقص نصه: ${id ? 'GOOGLE_CLIENT_SECRET' : 'GOOGLE_CLIENT_ID'} مو موجود.`);
    return 'failed';
  }

  say(`      GOOGLE_CLIENT_ID     = ${id}`);
  say(`      GOOGLE_CLIENT_SECRET = ${mask(secret)}`);

  if (!id.endsWith('.apps.googleusercontent.com')) {
    warn('شكل GOOGLE_CLIENT_ID مو المعتاد — عادة ينتهي بـ .apps.googleusercontent.com');
  }

  /*
   * Ask Google whether these two are a pair, using a code that is certainly
   * invalid. The answer distinguishes the two failures cleanly:
   *   invalid_client -> the id and secret are wrong, or not from one client
   *   invalid_grant  -> the credentials were accepted; only the code was bad
   * Nothing is signed in and no token is issued either way.
   */
  let data;
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'mps-credential-probe-not-a-real-code',
        client_id: id,
        client_secret: secret,
        redirect_uri: redirectUri,
      }),
    });
    data = await response.json();
  } catch (error) {
    warn('ما كدرنا نوصل لـ Google للتأكد من المفاتيح.');
    hint(`السبب: ${error.message}`);
    return 'skipped';
  }

  if (data.error === 'invalid_client') {
    bad(
      'Google رفض المفاتيح — الـ Client ID والـ Secret مو صحيحين أو مو من نفس الـ client.',
    );
    hint('انسخهن مرة ثانية من: APIs & Services ← Credentials ← نفس الـ OAuth client.');
    return 'failed';
  }
  if (data.error === 'redirect_uri_mismatch') {
    bad('المفاتيح صحيحة، بس رابط الرجوع مو مسجّل عند Google.');
    hint('أضف هذا بالضبط تحت Authorised redirect URIs:');
    hint(`  ${redirectUri}`);
    return 'failed';
  }
  if (data.error === 'invalid_grant') {
    ok('Google قبل المفاتيح — الـ ID والـ Secret زوج صحيح.');
  } else {
    warn(`رد غير متوقع من Google: ${data.error ?? '(بدون خطأ)'}`);
  }

  say();
  say(`      ${c.bold}تأكد أن هذا الرابط مسجّل عند Google حرف بحرف:${c.reset}`);
  say(`      ${c.cyan}${redirectUri}${c.reset}`);
  hint('Google Cloud ← Credentials ← افتح الـ OAuth client ← Authorised redirect URIs');
  hint('ولما تنشر الموقع، أضف نسخة ثانية بالرابط الحقيقي (https).');
  return 'passed';
}

async function main() {
  say(`${c.bold}فحص الخدمات الخارجية${c.reset}`);
  say(`${c.dim}القيم السرية تظهر مخفية — هذا الناتج آمن للمشاركة.${c.reset}`);

  const env = readEnv();
  if (!env) {
    bad('ماكو ملف .env بالمشروع.');
    hint('انسخ .env.example إلى .env، أو شغّل: pnpm setup');
    process.exitCode = 1;
    return;
  }

  const results = [await checkSupabase(env), await checkGoogle(env)];

  title('الخلاصة');
  const failed = results.filter((r) => r === 'failed').length;
  const skipped = results.filter((r) => r === 'skipped').length;

  if (failed > 0) {
    bad(`${failed} خدمة تحتاج تصليح — اقرأ الرسائل فوق.`);
    process.exitCode = 1;
    return;
  }
  if (skipped > 0) {
    warn(`${skipped} خدمة غير مهيّأة. الموقع يشتغل بدونها.`);
    return;
  }
  ok('كل الخدمات مهيّأة وتشتغل.');
}

await main();
