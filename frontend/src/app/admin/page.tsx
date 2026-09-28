"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ApiError, api, json } from "@/lib/api";
import { MSG, ROLE_LABEL, errorMessage } from "@/lib/messages";
import { useSession } from "@/lib/useSession";

// UI-10 — Quản trị (FR-01.4): tài khoản, môn/quyền, khóa khẩn cấp, audit. Mọi thay đổi bắt buộc có lý do (BR-11).
// Quản trị không đọc hội thoại hay nội dung tài liệu (AC-01.6).

interface Membership {
  course_id: string;
  can_read: boolean;
  can_download: boolean;
  can_upload: boolean;
  can_review: boolean;
  valid_to: string | null;
}
interface AdminUser {
  id: string;
  login_id: string;
  display_name: string;
  role: string;
  status: string;
  memberships: Membership[];
}
interface Course {
  id: string;
  name: string;
  code: string | null;
  term: string | null;
  status: string;
}
interface Doc {
  id: string;
  title: string;
  doc_type: string;
  current_version_id: string | null;
  emergency_locked: boolean;
}
interface AuditItem {
  action: string;
  object_type: string;
  object_id: string;
  course_id: string | null;
  actor: string;
  reason: string | null;
  created_at: string;
}

const TABS = {
  users: "Tài khoản & quyền",
  courses: "Môn học",
  documents: "Khóa khẩn cấp",
  audit: "Audit",
  ops: "Vận hành",
} as const;

export default function AdminPage() {
  const { profile, courses: myCourses, signOut, handleAuthError } = useSession();
  const [tab, setTab] = useState<keyof typeof TABS>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [docCourse, setDocCourse] = useState("");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const fail = useCallback(
    (e: unknown) => {
      if (!handleAuthError(e)) setMsg({ kind: "error", text: e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError });
    },
    [handleAuthError],
  );

  const load = useCallback(async () => {
    try {
      if (tab === "users" || tab === "courses" || tab === "documents") {
        setCourses((await api<{ items: Course[] }>("/admin/courses")).items);
      }
      if (tab === "users") setUsers((await api<{ items: AdminUser[] }>("/admin/users")).items);
      if (tab === "documents" && docCourse) setDocs((await api<{ items: Doc[] }>(`/admin/documents?course_id=${docCourse}`)).items);
      if (tab === "audit") setAudit((await api<{ items: AuditItem[] }>("/admin/audit?limit=300")).items);
    } catch (e) {
      fail(e);
    }
  }, [tab, docCourse, fail]);

  useEffect(() => {
    if (profile?.user.role === "admin") void load();
  }, [profile, load]);

  if (profile && profile.user.role !== "admin") {
    return (
      <AppShell profile={profile} courses={myCourses} onSignOut={signOut}>
        <main className="container">
          <div className="banner banner-error">{MSG.forbidden}</div>
        </main>
      </AppShell>
    );
  }

  const askReason = (what: string) => {
    const r = prompt(`Lý do ${what} (bắt buộc, lưu audit):`);
    return r && r.trim() ? r.trim() : null;
  };

  async function toggleLock(u: AdminUser) {
    const reason = askReason(u.status === "active" ? "khóa tài khoản" : "mở khóa tài khoản");
    if (!reason) return;
    try {
      await api(`/admin/users/${u.id}`, { method: "PATCH", body: json({ status: u.status === "active" ? "locked" : "active", reason }) });
      setMsg({ kind: "info", text: "Đã cập nhật tài khoản." });
      void load();
    } catch (e) {
      fail(e);
    }
  }

  async function toggleDoc(d: Doc) {
    const reason = askReason(d.emergency_locked ? "mở khóa tài liệu" : "khóa khẩn cấp tài liệu");
    if (!reason) return;
    try {
      await api(`/admin/documents/${d.id}/lock`, { method: "POST", body: json({ locked: !d.emergency_locked, reason }) });
      void load();
    } catch (e) {
      fail(e);
    }
  }

  return (
    <AppShell profile={profile} courses={myCourses} onSignOut={signOut}>
      <main className="container wide">
        <h2>Quản trị</h2>
        {msg && <div className={`banner banner-${msg.kind === "error" ? "error" : "info"}`}>{msg.text}</div>}
        <div className="chips">
          {(Object.keys(TABS) as (keyof typeof TABS)[]).map((t) => (
            <button key={t} type="button" className={`chip${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
              {TABS[t]}
            </button>
          ))}
        </div>

        {tab === "ops" && <OpsPanel onError={fail} />}

        {tab === "users" && (
          <>
            <CreateUser onDone={() => void load()} onError={fail} />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tài khoản</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Môn & quyền</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        {u.display_name}
                        <div className="muted small">{u.login_id}</div>
                      </td>
                      <td>{ROLE_LABEL[u.role] ?? u.role}</td>
                      <td>{u.status === "active" ? "Hoạt động" : "Đã khóa"}</td>
                      <td className="small">
                        {u.memberships.length === 0 && <span className="muted">—</span>}
                        {u.memberships.map((m) => (
                          <div key={m.course_id}>
                            {m.course_id}:{" "}
                            {[m.can_read && "đọc", m.can_download && "tải", m.can_upload && "upload", m.can_review && "duyệt"]
                              .filter(Boolean)
                              .join(", ")}
                            {m.valid_to && ` (đến ${m.valid_to.slice(0, 10)})`}
                          </div>
                        ))}
                      </td>
                      <td className="actions-cell">
                        <button type="button" className="btn-secondary" onClick={() => setEditing(u)}>
                          Quyền môn
                        </button>
                        {u.id !== profile?.user.id && (
                          <button type="button" className={u.status === "active" ? "btn-danger" : ""} onClick={() => void toggleLock(u)}>
                            {u.status === "active" ? "Khóa" : "Mở khóa"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {editing && (
              <MembershipEditor
                user={editing}
                courses={courses}
                onClose={() => setEditing(null)}
                onSaved={() => {
                  setEditing(null);
                  setMsg({ kind: "info", text: "Đã cập nhật quyền môn." });
                  void load();
                }}
                onError={fail}
              />
            )}
          </>
        )}

        {tab === "courses" && (
          <>
            <CreateCourse onDone={() => void load()} onError={fail} />
            <ul>
              {courses.map((c) => (
                <li key={c.id}>
                  <strong>{c.id}</strong> — {c.name} <span className="muted small">({c.status})</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {tab === "documents" && (
          <>
            <label>
              Môn{" "}
              <select value={docCourse} onChange={(e) => setDocCourse(e.target.value)}>
                <option value="">— Chọn môn —</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small">Khóa khẩn cấp chặn phục vụ ngay khi có sự cố; không dùng để công bố nguồn (FR-08.5).</p>
            <ul>
              {docs.map((d) => (
                <li key={d.id} className="row between">
                  <span>
                    {d.title} {d.emergency_locked && <strong className="warn">[ĐANG KHÓA]</strong>}
                  </span>
                  <button type="button" className={d.emergency_locked ? "" : "btn-danger"} onClick={() => void toggleDoc(d)}>
                    {d.emergency_locked ? "Mở khóa" : "Khóa khẩn cấp"}
                  </button>
                </li>
              ))}
              {docCourse && docs.length === 0 && <li className="muted">Chưa có tài liệu.</li>}
            </ul>
          </>
        )}

        {tab === "audit" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Người thực hiện</th>
                  <th>Hành động</th>
                  <th>Đối tượng</th>
                  <th>Lý do</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a, i) => (
                  <tr key={i}>
                    <td className="small">{a.created_at.slice(0, 16).replace("T", " ")}</td>
                    <td>{a.actor}</td>
                    <td>{a.action}</td>
                    <td className="small">
                      {a.object_type} {a.object_id} {a.course_id && `· ${a.course_id}`}
                    </td>
                    <td className="small">{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AppShell>
  );
}

interface Metrics {
  window_days: number;
  total_queries: number;
  by_status: Record<string, number>;
  latency_p95_ms: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  answered: "Trả lời có nguồn",
  partial: "Trả lời một phần",
  insufficient_evidence: "Chưa đủ căn cứ",
  needs_clarification: "Hỏi làm rõ",
  integrity_redirect: "Chặn liêm chính",
  error: "Lỗi kỹ thuật",
};

/** Số liệu vận hành thật từ GET /metrics (FR-12.4: chưa có dữ liệu thì ghi rõ, không điền số demo). */
function OpsPanel({ onError }: { onError: (e: unknown) => void }) {
  const [days, setDays] = useState(7);
  const [m, setM] = useState<Metrics | null>(null);
  useEffect(() => {
    setM(null);
    api<Metrics>(`/metrics?days=${days}`).then(setM, onError);
  }, [days, onError]);
  const rows = Object.entries(m?.by_status ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <section>
      <div className="row">
        <label className="small">
          Khoảng thời gian{" "}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[1, 7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} ngày
              </option>
            ))}
          </select>
        </label>
      </div>
      {!m && <div className="skeleton" />}
      {m && (
        <>
          <div className="tiles">
            <div className="tile">
              <div className="tile-value">{m.total_queries}</div>
              <div className="tile-label">Câu hỏi ({m.window_days} ngày)</div>
            </div>
            <div className="tile">
              <div className="tile-value">{m.latency_p95_ms !== null ? `${(m.latency_p95_ms / 1000).toFixed(1)} s` : "—"}</div>
              <div className="tile-label">Độ trễ p95{m.latency_p95_ms === null ? " (chưa có dữ liệu)" : ""}</div>
            </div>
            <div className="tile">
              <div className="tile-value">{m.by_status.answered ?? 0}</div>
              <div className="tile-label">Trả lời có nguồn</div>
            </div>
            <div className="tile">
              <div className="tile-value">{m.by_status.error ?? 0}</div>
              <div className="tile-label">Lỗi kỹ thuật</div>
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="muted">Chưa có dữ liệu sử dụng trong khoảng này.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Kết quả</th>
                    <th>Số lượt</th>
                    <th>Tỉ lệ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([s, n]) => (
                    <tr key={s}>
                      <td>{STATUS_LABEL[s] ?? s}</td>
                      <td>{n}</td>
                      <td>{((n / m.total_queries) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CreateUser({ onDone, onError }: { onDone: () => void; onError: (e: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ login_id: "", display_name: "", role: "student", password: "", reason: "" });
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/admin/users", { method: "POST", body: json(f) });
      setF({ login_id: "", display_name: "", role: "student", password: "", reason: "" });
      setOpen(false);
      onDone();
    } catch (e2) {
      onError(e2);
    }
  }
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)}>
        + Cấp tài khoản
      </button>
    );
  return (
    <form className="card form-grid" onSubmit={submit}>
      <label>
        Định danh đăng nhập
        <input required value={f.login_id} onChange={(e) => setF({ ...f, login_id: e.target.value })} />
      </label>
      <label>
        Tên hiển thị
        <input required value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} />
      </label>
      <label>
        Vai trò
        <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {Object.entries(ROLE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        Mật khẩu tạm (≥8 ký tự)
        <input type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      </label>
      <label>
        Lý do
        <input required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </label>
      <div className="row">
        <button type="submit">Tạo</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Hủy
        </button>
      </div>
    </form>
  );
}

function CreateCourse({ onDone, onError }: { onDone: () => void; onError: (e: unknown) => void }) {
  const [f, setF] = useState({ id: "", name: "", reason: "" });
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/admin/courses", { method: "POST", body: json(f) });
      setF({ id: "", name: "", reason: "" });
      onDone();
    } catch (e2) {
      onError(e2);
    }
  }
  return (
    <form className="card form-grid" onSubmit={submit}>
      <label>
        Mã môn
        <input required value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} placeholder="COURSE-04" />
      </label>
      <label>
        Tên môn
        <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </label>
      <label>
        Lý do
        <input required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </label>
      <button type="submit">Thêm môn</button>
    </form>
  );
}

function MembershipEditor({
  user,
  courses,
  onClose,
  onSaved,
  onError,
}: {
  user: AdminUser;
  courses: Course[];
  onClose: () => void;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const [rows, setRows] = useState<Membership[]>(user.memberships);
  const [reason, setReason] = useState("");
  const staff = user.role === "lecturer" || user.role === "reviewer";

  function toggleCourse(id: string, on: boolean) {
    setRows(on ? [...rows, { course_id: id, can_read: true, can_download: false, can_upload: false, can_review: false, valid_to: null }] : rows.filter((r) => r.course_id !== id));
  }
  function setFlag(id: string, k: keyof Membership, v: boolean) {
    setRows(rows.map((r) => (r.course_id === id ? { ...r, [k]: v } : r)));
  }
  async function save() {
    if (!reason.trim()) return;
    try {
      await api(`/admin/users/${user.id}/memberships`, { method: "PUT", body: json({ memberships: rows, reason }) });
      onSaved();
    } catch (e) {
      onError(e);
    }
  }
  return (
    <div className="card">
      <h3>Quyền môn — {user.display_name}</h3>
      {user.role === "admin" && <p className="muted small">Quản trị không được cấp quyền nội dung mặc định (PRD 5.1).</p>}
      <table>
        <thead>
          <tr>
            <th>Môn</th>
            <th>Gán</th>
            <th>Tải bản gốc</th>
            <th>Upload</th>
            <th>Duyệt</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((c) => {
            const r = rows.find((x) => x.course_id === c.id);
            return (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  <input type="checkbox" checked={!!r} onChange={(e) => toggleCourse(c.id, e.target.checked)} aria-label={`Gán ${c.name}`} />
                </td>
                <td>
                  <input type="checkbox" disabled={!r} checked={!!r?.can_download} onChange={(e) => setFlag(c.id, "can_download", e.target.checked)} />
                </td>
                <td>
                  <input type="checkbox" disabled={!r || !staff} checked={!!r?.can_upload} onChange={(e) => setFlag(c.id, "can_upload", e.target.checked)} />
                </td>
                <td>
                  <input
                    type="checkbox"
                    disabled={!r || user.role !== "reviewer"}
                    checked={!!r?.can_review}
                    onChange={(e) => setFlag(c.id, "can_review", e.target.checked)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <label>
        Lý do thay đổi (bắt buộc)
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="row">
        <button type="button" disabled={!reason.trim()} onClick={() => void save()}>
          Lưu
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Đóng
        </button>
      </div>
    </div>
  );
}
