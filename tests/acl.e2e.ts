// BR-03, FR-01/FR-05: lọc ACL trước retrieval — SV chỉ đọc/hỏi được tài liệu đã publish của môn mình được cấp.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { COURSE, ask, call, demoToken, post, seesDocument, upload, waitState } from './e2e-helpers';

test('tài liệu chưa publish không lộ qua thư viện, tìm kiếm hay chat', { timeout: 300_000 }, async () => {
  const [lecturer, student] = await Promise.all([demoToken('lecturer'), demoToken('student')]);
  const marker = `QUASARVOLT${Date.now()}`;
  const title = `E2E ACL draft ${marker}`;
  const draft = await upload(lecturer, title, [
    `The ${marker} protocol is an internal unpublished draft.`,
    `${marker} has exactly seventeen phases.`,
  ]);
  await waitState(lecturer, draft.version_id, ['Draft', 'NeedsReview']);

  expect(await seesDocument(student, title)).toBe(false);
  expect(await seesDocument(student, title, marker)).toBe(false);
  // SV không vào được trang quản lý / bản xem trước / bản gốc của phiên bản chưa duyệt
  expect((await call(student, `/manage/versions?course_id=${COURSE}`)).status).toBe(403);
  expect([403, 404]).toContain((await call(student, `/review/versions/${draft.version_id}/preview`)).status);
  expect([403, 404]).toContain(
    (await call(student, `/documents/${draft.document_id}/versions/${draft.version_id}/download`)).status,
  );

  const answer = await ask(student, `Trong môn Công nghệ phần mềm, giao thức ${marker} có bao nhiêu giai đoạn?`);
  expect(answer.citations.map((c) => c.document_id)).not.toContain(draft.document_id);
  expect(answer.content.toLowerCase()).not.toMatch(/seventeen|mười bảy|\b17\b/);
});

test('sinh viên chưa được cấp môn không đọc hay hỏi được tài liệu môn đó', { timeout: 200_000 }, async () => {
  const id = `e2e_sv_${Date.now()}`;
  const reg = await post(null, '/auth/register', { login_id: id, password: `Pw-${crypto.randomUUID()}`, display_name: 'E2E SV' });
  expect(reg.status).toBe(200);
  const outsider = reg.body.access_token;

  expect((await call(outsider, '/me/courses')).body.items).toEqual([]);
  expect([403, 404]).toContain((await call(outsider, `/documents?course_id=${COURSE}`)).status);
  expect([403, 404]).toContain((await call(outsider, `/knowledge-hub/search?course_id=${COURSE}&q=waterfall`)).status);

  const answer = await ask(outsider, 'Mô hình thác nước trong công nghệ phần mềm gồm những giai đoạn nào?');
  expect(answer.status).not.toBe('answered');
  expect(answer.citations ?? []).toEqual([]);
});
