// BL-06/07/08, FR-06–FR-08: upload → nộp duyệt → duyệt → publish → thu hồi; SV thấy/mất tài liệu theo từng bước.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { COURSE, adminToken, demoToken, newReviewer, post, publish, seesDocument, upload, version, waitState, withdraw } from './e2e-helpers';

test('vòng đời tài liệu: chỉ bản đã publish tới tay sinh viên', { timeout: 420_000 }, async ({ app, screen, browser }) => {
  const [lecturer, student] = await Promise.all([demoToken('lecturer'), demoToken('student')]);
  const reviewer = await newReviewer(await adminToken());
  const title = `E2E Lifecycle ${Date.now()}`;
  try {
    // Bản nháp: SV không thấy; GV không được tự duyệt bài mình tải lên (UAT-09)
    const draft = await upload(lecturer, `${title} draft`, ['Draft document for e2e.', `Marker ${Date.now()}`]);
    const ready = await waitState(lecturer, draft.version_id, ['Draft', 'NeedsReview']);
    expect(await seesDocument(student, `${title} draft`)).toBe(false);
    const self = await post(lecturer, `/versions/${draft.version_id}/decision`, {
      decision: 'approve', reason: 'self', reviewed_revision: ready.revision,
    });
    expect(self.status).toBe(403);

    // Publish: SV thấy trong thư viện API và trên trang Thư viện
    const pub = await publish(lecturer, reviewer.token, title, [
      'Software inspection checklist used by the e2e suite.',
      `Unique marker ${Date.now()}.`,
    ]);
    expect(await seesDocument(student, title)).toBe(true);

    await app.open('/login');
    await screen.getByRole('button', 'Dùng thử').tap();
    await screen.getByRole('button', 'Sinh viên').tap();
    await expect(browser).toHaveURL('/', { timeout: 15_000 });
    const openLibrary = async () => {
      await app.open('/library');
      await screen.getByLabel('Môn học').selectOption({ value: COURSE });
      await screen.getByLabel('Tìm tài liệu').fill(title);
    };
    await openLibrary();
    await expect(screen.getByText(title)).toBeVisible({ timeout: 30_000 });

    // Thu hồi: GV thường không được thu hồi (chỉ đề nghị); reviewer thu hồi → SV mất ngay
    expect((await post(lecturer, `/versions/${pub.version_id}/withdraw`, { reason: 'x' })).status).toBe(403);
    await withdraw(reviewer.token, pub.version_id);
    expect((await version(reviewer.token, pub.version_id)).state).toBe('Withdrawn');
    expect(await seesDocument(student, title)).toBe(false);
    await openLibrary();
    // tìm kiếm lai luôn trả vài tài liệu gần giống: chờ kết quả về rồi kiểm không còn thẻ mang đúng tên này
    await expect(screen.getByRole('region', 'Danh sách tài liệu')).toContainText('khớp', { timeout: 30_000 });
    await expect(screen.getByText(title)).toHaveCount(0);
  } finally {
    await reviewer.lock();
  }
});
