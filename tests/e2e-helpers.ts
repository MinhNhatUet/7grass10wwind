// Helper dùng chung cho tests/*.e2e.ts (không phải file test). Backend chạy cùng docker compose (:8000).
import { expect } from 'e2e';

export const API = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1';
export const COURSE = 'SE101';

// Mật khẩu admin chỉ dùng cho fetch tới API local, đọc từ .env (seed_cnpm.py ghi vào), không bao giờ in ra.
if (!process.env.DEMO_CNPM_ADMIN_PASSWORD) {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* thiếu .env: test cần admin sẽ báo lỗi rõ ở adminToken() */
  }
}

export async function call(token: string | null, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const res = await fetch(API + path, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

export const post = (token: string | null, path: string, data: unknown) =>
  call(token, path, { method: 'POST', body: JSON.stringify(data) });

async function tokenOf(res: { status: number; body: any }): Promise<string> {
  expect(res.status).toBe(200);
  return res.body.access_token;
}

export const demoToken = (role: 'student' | 'lecturer') => post(null, '/auth/demo-login', { role }).then(tokenOf);

export async function adminToken(): Promise<string> {
  const login_id = process.env.DEMO_CNPM_ADMIN_LOGIN ?? 'quantri';
  const password = process.env.DEMO_CNPM_ADMIN_PASSWORD;
  if (!password) throw new Error('Thiếu DEMO_CNPM_ADMIN_PASSWORD trong .env (chạy scripts/seed_cnpm.py)');
  return tokenOf(await post(null, '/auth/login', { login_id, password }));
}

/** Tài khoản demo không có GV duyệt: admin tạo một reviewer riêng cho lượt chạy này (khoá lại sau test). */
export async function newReviewer(admin: string): Promise<{ token: string; lock: () => Promise<void> }> {
  const login_id = `e2e_reviewer_${Date.now()}`;
  const password = `E2e-${crypto.randomUUID()}`;
  const created = await post(admin, '/admin/users', {
    login_id, display_name: 'E2E Reviewer', role: 'reviewer', password, reason: 'e2e test',
  });
  expect(created.status).toBe(201);
  const id = created.body.id;
  const m = await call(admin, `/admin/users/${id}/memberships`, {
    method: 'PUT',
    body: JSON.stringify({ memberships: [{ course_id: COURSE, can_read: true, can_review: true }], reason: 'e2e test' }),
  });
  expect(m.status).toBe(200);
  const token = await tokenOf(await post(null, '/auth/login', { login_id, password }));
  const lock = async () => {
    await call(admin, `/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'locked', reason: 'e2e done' }) });
  };
  return { token, lock };
}

/** PDF 1 trang tối thiểu (Helvetica, chỉ ASCII), đủ để backend trích văn bản. */
export function makePdf(lines: string[]): Blob {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => '\\' + c);
  const stream = 'BT /F1 12 Tf 50 780 Td 16 TL\n' + lines.map((l) => `(${esc(l)}) Tj T*`).join('\n') + '\nET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([pdf], { type: 'application/pdf' });
}

export async function upload(lecturer: string, title: string, lines: string[], integrity_label = 'learning_material') {
  const form = new FormData();
  form.set('course_id', COURSE);
  form.set('metadata', JSON.stringify({
    title, doc_type: 'reference', version_label: 'v1', provenance: 'E2E test (tự sinh)', usage_permission: 'confirmed',
    acl_roles: ['student', 'lecturer', 'reviewer'], download_allowed: false, integrity_label,
  }));
  form.set('file', makePdf(lines), `${title}.pdf`);
  const res = await call(lecturer, '/documents', { method: 'POST', body: form });
  expect(res.status).toBe(201);
  return res.body as { document_id: string; version_id: string };
}

export async function version(token: string, versionId: string) {
  const res = await call(token, `/manage/versions?course_id=${COURSE}`);
  expect(res.status).toBe(200);
  return res.body.items.find((v: any) => v.version_id === versionId);
}

/** Chờ phiên bản tới một trong các trạng thái (job trích/index chạy nền). */
export async function waitState(token: string, versionId: string, states: string[], timeoutMs = 240_000) {
  const end = Date.now() + timeoutMs;
  let v: any;
  while (Date.now() < end) {
    v = await version(token, versionId);
    if (states.includes(v?.state)) return v;
    if (v?.state === 'Failed') throw new Error(`Phiên bản ${versionId} lỗi: ${JSON.stringify(v.job)}`);
    await new Promise((r) => setTimeout(r, 2_000)); // ponytail: poll 2 s, đổi sang SSE nếu backend có
  }
  throw new Error(`Hết giờ chờ ${states}: trạng thái cuối ${v?.state}`);
}

/** upload → nộp duyệt → reviewer duyệt → chờ published. */
export async function publish(lecturer: string, reviewer: string, title: string, lines: string[], integrity_label?: string) {
  const up = await upload(lecturer, title, lines, integrity_label);
  const ready = await waitState(lecturer, up.version_id, ['Draft', 'NeedsReview']);
  const sub = await post(lecturer, `/versions/${up.version_id}/submit`, { acknowledge_warnings: ready.state === 'NeedsReview' });
  expect(sub.status).toBe(200);
  const v = await version(reviewer, up.version_id);
  const dec = await post(reviewer, `/versions/${up.version_id}/decision`, { decision: 'approve', reason: 'e2e', reviewed_revision: v.revision });
  expect(dec.status).toBe(200);
  await waitState(reviewer, up.version_id, ['Published']);
  return up;
}

export async function withdraw(reviewer: string, versionId: string) {
  const res = await post(reviewer, `/versions/${versionId}/withdraw`, { reason: 'e2e cleanup' });
  expect(res.status).toBe(200);
}

/** Hỏi trợ lý qua API, trả về tin nhắn của assistant. */
export async function ask(token: string, content: string) {
  const conv = await post(token, '/conversations', {});
  expect(conv.status).toBe(201);
  const res = await post(token, `/conversations/${conv.body.id}/messages`, { content });
  expect(res.status).toBe(200);
  return res.body as { status: string; content: string; citations: any[]; metadata: any };
}

/** Người dùng có thấy tài liệu `title` trong thư viện môn (có q → tìm kiếm Knowledge Hub) không. */
export async function seesDocument(token: string, title: string, q?: string): Promise<boolean> {
  const path = q
    ? `/knowledge-hub/search?course_id=${COURSE}&q=${encodeURIComponent(q)}`
    : `/documents?course_id=${COURSE}&page_size=100`;
  const res = await call(token, path);
  expect(res.status).toBe(200);
  return JSON.stringify(res.body).includes(title);
}
