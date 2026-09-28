"use client";

import { AppShell } from "@/components/AppShell";
import { ROLE_LABEL } from "@/lib/messages";
import { useSession } from "@/lib/useSession";

// Hồ sơ cá nhân (chuyển từ nhánh TV4 integration/frontend-backend): chỉ đọc /me + /me/courses; đổi thông tin qua Quản trị.

export default function ProfilePage() {
  const { profile, courses, signOut } = useSession();
  const u = profile?.user;
  return (
    <AppShell profile={profile} courses={courses} onSignOut={signOut}>
      <main className="container">
        <h2>Hồ sơ cá nhân</h2>
        {!profile && <div className="skeleton" />}
        {u && (
          <>
            <section className="card profile-head">
              <span className="avatar lg" aria-hidden="true">
                {(u.display_name || u.login_id).slice(0, 2).toUpperCase()}
              </span>
              <div>
                <h3>{u.display_name}</h3>
                <p className="muted small">
                  {u.login_id} · {ROLE_LABEL[u.role] ?? u.role}
                </p>
              </div>
            </section>
            <section className="card">
              <h3>Môn học của bạn ({courses?.length ?? 0})</h3>
              {courses && courses.length > 0 ? (
                <ul className="profile-courses">
                  {courses.map((c) => (
                    <li key={c.id}>
                      <strong>{c.name}</strong>
                      <span className="muted small">
                        {c.code || c.id}
                        {c.term ? ` · Học kỳ ${c.term}` : ""} · Đọc học liệu
                        {c.can_upload ? " · Tải tài liệu lên" : ""}
                        {c.can_review ? " · Duyệt tài liệu" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Chưa được cấp môn học nào. Liên hệ Quản trị hoặc Giảng viên để được cấp quyền.</p>
              )}
            </section>
            <section className="card">
              <h3>Phiên đăng nhập</h3>
              <p className="muted small">Hết hạn lúc {new Date(profile.session.expires_at).toLocaleString("vi-VN")}</p>
              <p className="muted small">Muốn đổi tên hiển thị hoặc mật khẩu? Liên hệ Quản trị.</p>
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
