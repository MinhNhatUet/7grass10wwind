// BR-02: không tin role/user_id từ client — danh tính và quyền chỉ lấy từ token phía server.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { call, demoToken, post } from './e2e-helpers';

test('role hoặc user_id giả từ client bị bỏ qua hoặc từ chối', { timeout: 200_000 }, async () => {
  // Tự đăng ký kèm role admin → vẫn chỉ là sinh viên
  const reg = await post(null, '/auth/register', {
    login_id: `e2e_forge_${Date.now()}`, password: `Pw-${crypto.randomUUID()}`, display_name: 'Forge', role: 'admin',
  });
  expect(reg.status).toBe(200);
  expect(reg.body.user.role).toBe('student');
  expect((await call(reg.body.access_token, '/admin/users')).status).toBe(403);

  // Nút demo không cấp admin; token sai/thiếu → 401
  expect((await post(null, '/auth/demo-login', { role: 'admin' })).status).toBe(422);
  expect((await call('forged.token.value', '/me')).status).toBe(401);
  expect((await call(null, '/me')).status).toBe(401);

  const student = await demoToken('student');
  const me = (await call(student, '/me')).body.user;
  const lecturer = (await call(await demoToken('lecturer'), '/me')).body.user;

  // Header/query giả danh không đổi được người dùng hay vai trò
  const spoof = { 'X-User-Id': lecturer.id, 'X-Role': 'admin', 'X-User-Role': 'lecturer' };
  const spoofed = await call(student, `/me?user_id=${lecturer.id}&role=admin`, { headers: spoof });
  expect(spoofed.body.user.id).toBe(me.id);
  expect(spoofed.body.roles).toEqual(['student']);
  expect((await call(student, '/admin/users', { headers: spoof })).status).toBe(403);
  expect((await call(student, '/manage/versions?course_id=SE101', { headers: spoof })).status).toBe(403);
  expect((await call(student, '/learning/curriculum?course_id=SE101', { headers: spoof })).status).toBe(200);
  // ngược lại: GV giả làm SV vẫn không vào được dữ liệu học tập của SV (chỉ vai trò student)
  const asLecturer = await demoToken('lecturer');
  expect((await call(asLecturer, '/learning/progress?course_id=SE101', { headers: { 'X-Role': 'student' } })).status).toBe(403);

  // Body tin nhắn kèm user_id/role lạ: hội thoại vẫn thuộc về SV trong token
  const conv = await post(student, '/conversations', { user_id: lecturer.id, role: 'admin' });
  expect(conv.status).toBe(201);
  const msg = await post(student, `/conversations/${conv.body.id}/messages`, {
    content: 'Kiểm thử phần mềm là gì?', user_id: lecturer.id, role: 'admin',
  });
  expect(msg.status).toBe(200);
  expect((await call(asLecturer, `/conversations/${conv.body.id}`)).status).toBe(404);
  const mine = await call(student, '/conversations');
  expect(JSON.stringify(mine.body)).toContain(conv.body.id);

  // Biết id hội thoại của người khác vẫn không đọc/gửi được
  const theirs = await post(asLecturer, '/conversations', {});
  expect((await call(student, `/conversations/${theirs.body.id}/messages`)).status).toBe(404);
  expect((await post(student, `/conversations/${theirs.body.id}/messages`, { content: 'xin chào' })).status).toBe(404);
});
