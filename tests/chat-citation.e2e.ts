// BR-04, FR-02 (BL-10/12): câu trả lời học thuật có trích dẫn [n], mỗi [n] trỏ tới nguồn thật mở được.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { ask, call, demoToken } from './e2e-helpers';

const QUESTION = 'Mô hình thác nước (waterfall) trong công nghệ phần mềm gồm những giai đoạn nào?';

test('mỗi [n] trong câu trả lời khớp một nguồn mở được', { timeout: 200_000 }, async () => {
  const student = await demoToken('student');
  const answer = await ask(student, QUESTION);
  expect(answer.status).toBe('answered');
  expect(answer.citations.length).toBeGreaterThan(0);

  const ids = new Set(answer.citations.map((c) => String(c.id)));
  const used = [...answer.content.matchAll(/\[(\d+)\]/g)].map((m) => m[1]);
  expect(used.length).toBeGreaterThan(0);
  for (const n of used) expect(ids.has(n)).toBe(true);

  for (const c of answer.citations) {
    expect(c.document_title).toBeTruthy();
    const src = await call(student, `/citations/${c.citation_id}/source`);
    expect(src.status).toBe(200);
  }
});

test('sinh viên bấm trích dẫn trên giao diện và xem được trang nguồn', { timeout: 240_000 }, async ({ app, screen, browser, agent }) => {
  await app.open('/login');
  await screen.getByRole('button', 'Dùng thử').tap();
  await screen.getByRole('button', 'Sinh viên').tap();
  await expect(browser).toHaveURL('/', { timeout: 15_000 });

  const box = screen.getByPlaceholder('Message EDU-04...');
  await box.fill(QUESTION);
  await box.press('Enter');

  const badge = browser.locator('button[aria-label^="Nguồn"]').first();
  await expect(badge).toBeVisible({ timeout: 150_000 });
  await badge.tap();
  await expect(screen.getByRole('region', 'Trang tài liệu trích dẫn')).toBeVisible({ timeout: 15_000 });
  await expect(screen.getByText('Đang tải và kiểm tra quyền xem nguồn…')).toBeHidden({ timeout: 60_000 });
  await agent.assert('the source viewer shows the cited document page (title, page image or excerpt), not an error', {
    vision: true,
  });
});
