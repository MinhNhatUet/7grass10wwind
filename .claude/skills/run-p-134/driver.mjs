#!/usr/bin/env node
// Driver cho EDU-04 / VAssistant: chọc vào app ĐANG CHẠY (backend FastAPI :8000, frontend Next :3000).
// Chạy từ gốc repo:  node .claude/skills/run-p-134/driver.mjs <lệnh> [...]
//
//   health                                   backend /health, frontend /login, Postgres (docker)
//   login  <student|lecturer|admin>           in access token
//   api    <METHOD> <path> [json] [--role r]  gọi API thô (path tính từ /api/v1), in JSON
//   ask    "<câu hỏi>" [--role r] [--assistant academic|learning|hub]
//                                            hỏi trợ lý qua API: status, nội dung, trích dẫn, route
//   shot   <path> [--role r] [--out f.png] [--wait ms] [--dark]
//                                            đăng nhập qua UI, mở trang, chụp ảnh, in chữ trong <main>
//   chat   "<câu hỏi>" [--out f.png]         SV gõ vào ô chat thật, chờ trả lời, chụp ảnh
//
// Env: API_URL (mặc định http://localhost:8000), APP_URL (mặc định http://localhost:3000).
// Ảnh lưu ở .claude/skills/run-p-134/shots/ (gitignored) nếu không có --out.
import { readFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const API = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const APP = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const CHAT_BOX = 'Hỏi EDU-04 hoặc bắt đầu bằng câu hỏi học thuật...';

// Tách cờ (--role x, --dark …) khỏi tham số vị trí TRƯỚC khi gọi lệnh
const FLAGS = {};
const argv = [];
for (let i = 0, a = process.argv.slice(2); i < a.length; i++) {
  if (!a[i].startsWith('--')) { argv.push(a[i]); continue; }
  const v = a[i + 1];
  FLAGS[a[i].slice(2)] = v === undefined || v.startsWith('--') ? true : (i++, v);
}
const flag = (name, def) => FLAGS[name] ?? def;
// Git Bash (MSYS) đổi tham số "/me" thành "C:/Program Files/Git/me" trước khi tới Node → gỡ lại; "me" cũng nhận
const urlPath = (p = '/') => {
  const fixed = p.replace(/^[A-Za-z]:[\\/].*?[\\/]Git(?=[\\/])/, '').replace(/\\/g, '/');
  return fixed.startsWith('/') ? fixed : `/${fixed}`;
};

/** Mật khẩu admin không có nút demo: đọc DEMO_CNPM_ADMIN_* từ .env (scripts/seed_cnpm.py ghi vào), không in ra. */
function envFile() {
  const out = {};
  try {
    for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* không có .env */ }
  return out;
}

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function login(role = 'student') {
  if (role === 'admin') {
    const env = envFile();
    const r = await call('POST', '/auth/login', { login_id: env.DEMO_CNPM_ADMIN_LOGIN ?? 'quantri', password: env.DEMO_CNPM_ADMIN_PASSWORD });
    if (r.status !== 200) throw new Error(`admin login ${r.status}: ${JSON.stringify(r.data)} (thiếu DEMO_CNPM_ADMIN_PASSWORD trong .env?)`);
    return r.data;
  }
  const r = await call('POST', '/auth/demo-login', { role });
  if (r.status !== 200) throw new Error(`demo-login ${r.status}: ${JSON.stringify(r.data)} (DEMO_LOGIN_ENABLED=true trong .env?)`);
  return r.data;
}

async function browserPage({ dark = false } = {}) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: dark ? 'dark' : 'light', locale: 'vi-VN' });
  return { browser, page: await ctx.newPage() };
}

/** Đăng nhập qua giao diện thật: SV/GV bằng nút "Dùng thử", admin bằng form mật khẩu. */
async function uiLogin(page, role) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' });
  // Nút "Dùng thử" chỉ hiện SAU hydrate + fetch /auth/demo-login → tín hiệu React đã gắn handler.
  // Bấm trước lúc đó (next dev hydrate chậm) thì form không làm gì và URL không bao giờ đổi.
  await page.getByRole('button', { name: 'Dùng thử' }).waitFor({ timeout: 90_000 });
  if (role === 'admin') {
    const env = envFile();
    // theo id: getByLabel('Mật khẩu') khớp cả nút "Hiện mật khẩu" (Playwright so khớp chuỗi con)
    await page.locator('#email').fill(env.DEMO_CNPM_ADMIN_LOGIN ?? 'quantri');
    await page.locator('#password').fill(env.DEMO_CNPM_ADMIN_PASSWORD ?? '');
    const submit = page.getByRole('button', { name: 'Đăng nhập hệ thống' });
    await submit.click();
    // 'commit': next dev có lúc không bắn 'load' sau khi chuyển trang → chỉ cần URL đã đổi; chưa đổi thì bấm lại 1 lần
    await page.waitForURL(/\/admin/, { timeout: 20_000, waitUntil: 'commit' }).catch(async () => {
      await submit.click();
      await page.waitForURL(/\/admin/, { timeout: 40_000, waitUntil: 'commit' });
    });
  } else {
    await page.getByRole('button', { name: 'Dùng thử' }).click();
    await page.getByRole('button', { name: role === 'lecturer' ? 'Giảng viên' : 'Sinh viên' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000, waitUntil: 'commit' });
  }
}

const shotPath = (out, name) => {
  if (out && out !== true) return resolve(out);
  mkdirSync(join(HERE, 'shots'), { recursive: true });
  return join(HERE, 'shots', `${name.replace(/[^\w-]+/g, '_').replace(/^_|_$/g, '') || 'root'}.png`);
};
const mainText = async (page) => ((await page.locator('main').first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();

const commands = {
  async health() {
    const check = async (label, url) => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        console.log(`${label.padEnd(9)} ${r.status} ${url}`);
        return r.ok;
      } catch (e) {
        console.log(`${label.padEnd(9)} DOWN ${url} (${e.cause?.code ?? e.name})`);
        return false;
      }
    };
    const ok = [await check('backend', `${API}/health`), await check('frontend', `${APP}/login`)];
    try {
      console.log(`postgres  ${execSync('docker inspect -f "{{.State.Health.Status}}" edu04-db', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()} (edu04-db)`);
    } catch {
      console.log('postgres  ? (container edu04-db không có — DATABASE_URL có thể là SQLite)');
    }
    process.exitCode = ok.every(Boolean) ? 0 : 1;
  },

  async login(role = 'student') {
    console.log((await login(role)).access_token);
  },

  async api(method, path, body) {
    const role = flag('role', 'student');
    const tok = (await login(role)).access_token;
    const r = await call(method.toUpperCase(), urlPath(path), body ? JSON.parse(body) : undefined, tok);
    console.log(r.status);
    console.log(JSON.stringify(r.data, null, 2));
  },

  async ask(question) {
    const role = flag('role', 'student');
    const assistant = flag('assistant');
    const tok = (await login(role)).access_token;
    const conv = await call('POST', '/conversations', {}, tok);
    const r = await call('POST', `/conversations/${conv.data.id}/messages`, { content: question, ...(assistant ? { assistant } : {}) }, tok);
    if (r.status !== 200) { console.log(r.status, JSON.stringify(r.data)); process.exitCode = 1; return; }
    const m = r.data;
    console.log(`status:    ${m.status}`);
    console.log(`route:     ${JSON.stringify(m.metadata?.route?.steps ?? [])}`);
    console.log(`grounding: ${JSON.stringify(m.metadata?.grounding ?? null)}`);
    if (m.metadata?.choices) console.log(`choices:   ${JSON.stringify(m.metadata.choices.map((c) => c.label))}`);
    console.log(`\n${m.content}\n`);
    for (const c of m.citations ?? []) console.log(`[${c.id}] ${c.document_title} · ${JSON.stringify(c.locator)}`);
  },

  async shot(raw = '/') {
    const path = urlPath(raw);
    const role = flag('role', 'student');
    const out = flag('out');
    const wait = Number(flag('wait', 4000));
    const dark = flag('dark', false) === true;
    const { browser, page } = await browserPage({ dark });
    try {
      await uiLogin(page, role);
      await page.goto(`${APP}${path}`, { waitUntil: 'domcontentloaded' });
      // trang tải dữ liệu bằng fetch sau hydrate: chờ mạng rảnh (websocket HMR không tính) rồi chờ thêm `wait` cho render
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(wait);
      const file = shotPath(out, `${role}${path}${dark ? '-dark' : ''}`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`screenshot: ${file}`);
      console.log(`url:        ${page.url()}`);
      console.log(`main:       ${(await mainText(page)).slice(0, 1500)}`);
    } finally {
      await browser.close();
    }
  },

  async chat(question) {
    const out = flag('out');
    const { browser, page } = await browserPage();
    try {
      await uiLogin(page, 'student');
      const box = page.getByPlaceholder(CHAT_BOX);
      await box.fill(question);
      await box.press('Enter');
      // xong khi có nhãn nguồn [n], nút lựa chọn (câu hỏi làm rõ) hoặc nút phản hồi 👍 của câu trả lời
      await page.locator('button[aria-label^="Nguồn"], [role="group"][aria-label="Lựa chọn"], button[title="Hữu ích"]')
        .first().waitFor({ timeout: 180_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const file = shotPath(out, `chat-${Date.now()}`);
      await page.screenshot({ path: file });
      console.log(`screenshot: ${file}`);
      console.log(`main:       ${(await mainText(page)).slice(-1500)}`);
    } finally {
      await browser.close();
    }
  },
};

const [cmd, ...rest] = argv;
if (!commands[cmd]) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 17).join('\n').replace(/^\/\/ ?/gm, ''));
  process.exit(cmd ? 2 : 0);
}
try {
  await commands[cmd](...rest);
} catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}
