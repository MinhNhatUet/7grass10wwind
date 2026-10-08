// FR-03.2–03.12 (D-82): chọn bài đã học → làm bài đánh giá → xem kết quả → chọn và xác nhận lộ trình.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { COURSE, call, demoToken } from './e2e-helpers';

test('sinh viên làm bài đánh giá và nhận lộ trình học', { timeout: 420_000 }, async ({ app, screen, browser, agent }) => {
  const student = await demoToken('student');
  const before = (await call(student, `/learning/paths?course_id=${COURSE}`)).body.items.length;

  await app.open('/login');
  await screen.getByRole('button', 'Dùng thử').tap();
  await screen.getByRole('button', 'Sinh viên').tap();
  await expect(browser).toHaveURL('/', { timeout: 15_000 });
  await app.open('/learning/plans');
  await expect(screen.getByText('Lộ trình theo tiến độ')).toBeVisible({ timeout: 30_000 });

  // ô chọn môn rồi ô "Đã học tới" (không có nhãn truy cập riêng)
  await browser.locator('section select').first().selectOption({ value: COURSE });
  await expect(screen.getByText('Đã học tới:')).toBeVisible({ timeout: 60_000 });
  await browser.locator('section select').nth(1).selectOption({ index: 2 });
  await screen.getByRole('button', 'Làm bài đánh giá').tap();

  // đề do LLM soạn (~25 s)
  await agent.waitFor('a multiple-choice assessment with questions is shown', { timeout: 120_000 });
  await agent.act('answer every question in the assessment by picking one option each, then submit it');
  await agent.waitFor('the assessment results are shown, with suggested learning path options', { timeout: 120_000 });
  await agent.act('choose one of the suggested learning paths ("Chọn lộ trình này")');
  await agent.act('confirm the chosen path and start step 1 ("Xác nhận, bắt đầu bước 1")');
  await agent.assert('a learning path with its ordered steps is shown');

  const after = (await call(student, `/learning/paths?course_id=${COURSE}`)).body.items.length;
  expect(after).toBeGreaterThan(before);
});
