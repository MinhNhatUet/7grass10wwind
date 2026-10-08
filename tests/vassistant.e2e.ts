import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Backend chạy cùng docker compose (frontend :3000 gọi API :8000).
const API = process.env.API_URL ?? 'http://localhost:8000';

async function demoToken(role: 'student' | 'lecturer'): Promise<string> {
  const res = await fetch(`${API}/api/v1/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  expect(res.status).toBe(200);
  return (await res.json()).access_token;
}

test('chương trình học do LLM dựng, không còn tên slide rác', async () => {
  const token = await demoToken('student');
  for (const course of ['DB101', 'PHIL101', 'HCM101']) {
    const res = await fetch(`${API}/api/v1/learning/curriculum?course_id=${course}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const cur = await res.json();
    expect(cur.source).toBe('generated');
    expect(cur.lessons.length).toBeGreaterThan(2);
    const titles: string[] = cur.lessons.flatMap((l: { title: string; topics: { title: string }[] }) => [
      l.title,
      ...l.topics.map((t) => t.title),
    ]);
    for (const title of titles) {
      expect(title).not.toMatch(/^(Trang chiếu|Slide)\s*\d|^Nội dung$/i);
    }
  }
});

test(
  'công thức trong câu trả lời: dòng riêng, căn giữa, cite đi liền',
  { timeout: 180_000 },
  async ({ app, screen, browser }) => {
    await app.open('/login');
    await screen.getByRole('button', 'Dùng thử').tap();
    await screen.getByRole('button', 'Sinh viên').tap();
    await expect(browser).toHaveURL('/', { timeout: 15_000 });

    const box = screen.getByPlaceholder('Message EDU-04...');
    await box.fill('định lý Green trong giải tích vectơ');
    await box.press('Enter');

    // câu trả lời của LLM: chờ đoạn công thức (chỉ gồm KaTeX + dấu câu + cite) được căn giữa
    const formula = browser.locator('p.text-center:has(.katex)').first();
    await expect(formula).toBeVisible({ timeout: 150_000 });
    // nhãn trích dẫn nằm TRONG cùng đoạn với công thức (không rơi xuống dòng dưới)
    await expect(browser.locator('p.text-center:has(.katex) button[aria-label^="Nguồn"]').first()).toBeVisible();
    await app.screenshot('cong-thuc-green');
  },
);
