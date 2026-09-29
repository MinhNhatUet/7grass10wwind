"use client";

import { useSearchParams } from "next/navigation";
import { type FormEvent, Fragment, Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell, Icon } from "@/components/AppShell";
import { CiteChip } from "@/components/CiteChip";
import { ClozeCard, FlashcardDeck, QuickActions, TriageCard } from "@/components/StudyTools";
import { type ReaderTarget, SourceReader } from "@/components/SourceReader";
import {
  ApiError,
  type ChatMessage,
  type Citation,
  type Conversation,
  type HubResult,
  type Plan,
  type SourceView,
  type PlanSession,
  api,
  downloadFile,
  json,
  newRequestId,
} from "@/lib/api";
import { ASSISTANT_LABEL, FEEDBACK_LABEL, LEVEL_LABEL, MSG, errorMessage } from "@/lib/messages";
import { useSession } from "@/lib/useSession";

// UI-03 — Hội thoại chung + UI-06 panel nguồn. Một ô nhập duy nhất: router chọn MÔN (trong các môn được phép)
// và trợ lý theo prompt (FR-11, D-28) — không có bước chọn môn hay chip trợ lý.


interface Pending {
  content: string;
  requestId: string;
  body: Record<string, unknown>;
  convId?: string; // hội thoại nhận request: pending/lỗi/thử lại luôn gắn đúng hội thoại này
}

const MESSAGE_PAGE = 100;
const CONV_PAGE = 50;

function ChatInner() {
  const params = useSearchParams();
  const { profile, courses, signOut, handleAuthError } = useSession();

  const [convs, setConvs] = useState<Conversation[]>([]);
  const [convId, setConvId] = useState<string | null>(params.get("conv"));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [convCursor, setConvCursor] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [failed, setFailed] = useState<{ pending: Pending; message: string; retryable: boolean } | null>(null);
  const [reader, setReader] = useState<ReaderTarget | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  // Hội thoại đang mở + số thứ tự lần tải: response đến muộn của hội thoại khác/lần tải cũ bị bỏ qua
  const openConv = useRef<string | null>(convId);
  const loadSeq = useRef(0);
  openConv.current = convId;

  const courseNames = new Map((courses ?? []).map((c) => [c.id, c.name]));
  const noContentAccess = courses !== null && courses.length === 0;
  const current = convs.find((c) => c.id === convId);
  const scopedTitle = current?.document_id ? current.document_title ?? "tài liệu đã chọn" : null;
  // Pending/lỗi chỉ hiện ở hội thoại của chính request đó (chưa có id = hội thoại mới đang tạo)
  const shownPending = pending && (!pending.convId || pending.convId === convId) ? pending : null;
  const shownFailed = failed && (!failed.pending.convId || failed.pending.convId === convId) ? failed : null;

  const loadConvs = useCallback(async () => {
    try {
      const data = await api<{ items: Conversation[]; next_cursor: number | null }>(
        `/conversations?limit=${CONV_PAGE}`,
      );
      setConvs(data.items);
      setConvCursor(data.next_cursor);
    } catch (err) {
      handleAuthError(err);
    }
  }, [handleAuthError]);

  async function loadMoreConvs() {
    if (convCursor === null) return;
    try {
      const data = await api<{ items: Conversation[]; next_cursor: number | null }>(
        `/conversations?limit=${CONV_PAGE}&cursor=${convCursor}`,
      );
      setConvs((prev) => [...prev, ...data.items.filter((c) => !prev.some((p) => p.id === c.id))]);
      setConvCursor(data.next_cursor);
    } catch (err) {
      handleAuthError(err);
    }
  }

  useEffect(() => {
    if (courses && courses.length) void loadConvs();
  }, [courses, loadConvs]);

  const loadMessages = useCallback(
    async (id: string) => {
      const seq = ++loadSeq.current;
      const stale = () => seq !== loadSeq.current || openConv.current !== id;
      try {
        // Trang MỚI NHẤT trước: hội thoại > 100 tin vẫn hiện câu vừa trả lời; tin cũ hơn tải khi bấm
        const data = await api<{ items: ChatMessage[]; next_cursor: number | null }>(
          `/conversations/${id}/messages?limit=${MESSAGE_PAGE}&latest=true`,
        );
        if (stale()) return;
        setMessages(data.items);
        setOlderCursor(data.next_cursor);
      } catch (err) {
        if (!handleAuthError(err) && !stale()) {
          setConvId(null);
          setMessages([]);
          setOlderCursor(null);
        }
      }
    },
    [handleAuthError],
  );

  async function loadOlder() {
    const id = convId;
    if (!id || olderCursor === null) return;
    const seq = loadSeq.current;
    setLoadingOlder(true);
    try {
      const data = await api<{ items: ChatMessage[]; next_cursor: number | null }>(
        `/conversations/${id}/messages?limit=${MESSAGE_PAGE}&latest=true&cursor=${olderCursor}`,
      );
      if (seq !== loadSeq.current || openConv.current !== id) return;
      setMessages((prev) => [...data.items.filter((m) => !prev.some((p) => p.message_id === m.message_id)), ...prev]);
      setOlderCursor(data.next_cursor);
    } catch (err) {
      handleAuthError(err);
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    if (convId) void loadMessages(convId);
    else {
      loadSeq.current++; // bỏ mọi response đang chờ của hội thoại trước
      setMessages([]);
      setOlderCursor(null);
    }
    setReader(null);
    setSourceError(null);
  }, [convId, loadMessages]);

  // Chỉ cuộn xuống khi có tin MỚI NHẤT khác (tải tin cũ hơn thêm vào đầu danh sách, không kéo màn hình xuống)
  const lastMessageId = messages.length ? messages[messages.length - 1].message_id : null;
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastMessageId, pending]);

  async function ensureConversation(): Promise<string> {
    if (convId) return convId;
    const conv = await api<Conversation & { conversation_id: string }>("/conversations", {
      method: "POST",
      body: json({}), // không cố định môn: router chọn môn theo từng câu hỏi (D-28)
    });
    openConv.current = conv.conversation_id; // trước khi render lại, để response của hội thoại mới không bị bỏ
    setConvId(conv.conversation_id);
    return conv.conversation_id;
  }

  async function send(p: Pending) {
    let target: Pending = p;
    setPending(p);
    setFailed(null);
    try {
      // Thử lại gửi vào đúng hội thoại cũ của request, không phải hội thoại đang mở
      const id = p.convId ?? (await ensureConversation());
      target = { ...p, convId: id };
      setPending(target);
      await api<ChatMessage>(`/conversations/${id}/messages`, {
        method: "POST",
        body: json(p.body),
        idempotencyKey: p.requestId, // Thử lại dùng lại key: không tạo 2 câu trả lời (AC-02.6)
      });
      await loadMessages(id); // tự bỏ qua nếu người dùng đã chuyển sang hội thoại khác
      void loadConvs();
    } catch (err) {
      if (handleAuthError(err)) return;
      const e = err instanceof ApiError ? err : new ApiError(0, "NETWORK_ERROR", true);
      setFailed({ pending: target, message: errorMessage(e.code), retryable: e.retryable });
      if (target.convId) void loadMessages(target.convId);
    } finally {
      setPending(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || pending) return;
    const body = { content }; // router chọn môn + trợ lý và rút tham số (số ngày, phút/ngày…) từ câu hỏi
    setInput("");
    void send({ content, requestId: newRequestId(), body });
  }

  // Mở nguồn kiểu NotebookLM: backend kiểm quyền + trả đoạn hỗ trợ, rồi reader tải toàn văn quanh trang đó
  // Nút bắt đầu nhanh (D-30): gửi thẳng cho router, hoặc điền sẵn câu mẫu để người học thêm chủ đề
  function quickSend(text: string) {
    void send({ content: text, requestId: newRequestId(), body: { content: text } });
  }

  // Ôn tập theo ngày (D-37): ép Learning/quiz, chủ đề = buổi học; server lấy môn từ lộ trình (plan_id)
  function practice(planId: string, s: PlanSession) {
    const content = `Ôn tập ngày ${s.day}: ${s.title}`;
    void send({
      content,
      requestId: newRequestId(),
      body: { content, assistant: "learning", learning: { action: "quiz", topic: `${s.title}. ${s.objective}`, plan_id: planId } },
    });
  }

  function fill(text: string) {
    setInput(text);
    setTimeout(() => {
      const el = document.getElementById("chat-input") as HTMLInputElement | null;
      el?.focus();
    }, 0);
  }

  async function openCitation(c: Citation) {
    await showSource(`/citations/${c.citation_id}/source`);
  }

  async function showSource(path: string) {
    setLoadingSource(true);
    setSourceError(null);
    try {
      const s = await api<SourceView>(path); // luôn gọi lại endpoint kiểm quyền (UI-06, BR-03)
      setReader({
        documentId: s.document_id,
        versionId: s.version_id,
        title: s.title,
        versionLabel: s.version_label,
        page: s.locator.value,
        locatorType: s.locator.type,
        highlight: s.quote ?? s.excerpt.slice(0, 400),
        canDownload: s.can_download,
      });
    } catch (err) {
      if (!handleAuthError(err)) {
        setReader(null);
        setSourceError(err instanceof ApiError ? errorMessage(err.code) : MSG.serviceError);
      }
    } finally {
      setLoadingSource(false);
    }
  }

  const history = (
    <>
    <div className="row between">
      <h3>Gần đây</h3>
      {convs.length > 0 && (
        <button
          type="button"
          className="btn-link btn-link-danger small"
          onClick={async () => {
            if (!confirm(`Xóa tất cả ${convs.length} hội thoại? Lịch sử sẽ bị ẩn ngay và không khôi phục trên giao diện.`))
              return;
            try {
              await api("/conversations", { method: "DELETE" });
              setConvId(null);
              setMessages([]);
            } catch (err) {
              handleAuthError(err);
            }
            void loadConvs();
          }}
        >
          Xóa tất cả
        </button>
      )}
    </div>
    {convs.length === 0 && <p className="muted small">Chưa có hội thoại.</p>}
    <ul className="conv-list">
      {convs.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            className={`conv-item${c.id === convId ? " active" : ""}`}
            onClick={() => setConvId(c.id)}
            title={c.title}
          >
            {c.document_id ? "📄 " : ""}
            {c.title}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Xóa hội thoại ${c.title}`}
            onClick={async () => {
              if (!confirm("Xóa hội thoại này? Hội thoại sẽ bị ẩn ngay.")) return;
              await api(`/conversations/${c.id}`, { method: "DELETE" }).catch(handleAuthError);
              if (c.id === convId) setConvId(null);
              void loadConvs();
            }}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
    {convCursor !== null && (
      <button type="button" className="btn-link small" onClick={() => void loadMoreConvs()}>
        Xem thêm hội thoại
      </button>
    )}
    </>
  );

  function newChat() {
    setConvId(null);
    setMessages([]);
  }

  const empty = messages.length === 0 && !shownPending;
  const panelOpen = !!(reader || loadingSource || sourceError);

  return (
    <AppShell profile={profile} courses={courses} onSignOut={signOut} side={history} onNewChat={newChat}>
      <div className={`chat-layout${panelOpen ? " has-panel" : ""}`}>

        <section className={`chat-main${empty ? " centered" : ""}`}>
          <div className="mode-switch" role="navigation" aria-label="Chế độ">
            <span className="active">Chat</span>
            <Link href="/library">Tài liệu</Link>
          </div>
          {noContentAccess && (
            <div className="banner banner-info">
              {profile?.user.role === "admin" ? "Tài khoản quản trị không có quyền nội dung." : MSG.noCourses}
            </div>
          )}

          <div className="messages">
            {olderCursor !== null && (
              <button type="button" className="btn-link" disabled={loadingOlder} onClick={() => void loadOlder()}>
                ↑ Tải tin nhắn cũ hơn
              </button>
            )}
            {empty && (
              <div className="empty">
                <h2>{scopedTitle ? `Hỏi về “${scopedTitle}”` : "Bạn đã sẵn sàng chưa?"}</h2>
                {scopedTitle && <p>Câu trả lời chỉ lấy nguồn từ tài liệu này.</p>}
              </div>
            )}
            {messages.map((m) => (
              <MessageView
                key={m.message_id}
                m={m}
                courseNames={courseNames}
                onCitation={openCitation}
                onHubOpen={(r) => showSource(`/chunks/${r.chunk_id}/source`)}
                onChanged={() => convId && loadMessages(convId)}
                onAuthError={handleAuthError}
                onPractice={practice}
              />
            ))}
            {shownPending && (
              <>
                <div className="msg user">
                  <div className="bubble">{shownPending.content}</div>
                </div>
                <div className="msg assistant">
                  <div className="bubble pending" aria-live="polite">
                    <div className="skeleton-line" />
                    <div className="skeleton-line short" />
                    <span className="muted small">Đang tìm nguồn và soạn câu trả lời…</span>
                  </div>
                </div>
              </>
            )}
            {shownFailed && (
              <div className="banner banner-error" role="alert">
                {shownFailed.message}{" "}
                {shownFailed.retryable && (
                  <button type="button" className="link" onClick={() => void send(shownFailed.pending)}>
                    Thử lại
                  </button>
                )}
              </div>
            )}
            <div ref={bottom} />
          </div>

          <form className="composer" onSubmit={onSubmit}>
            {scopedTitle && (
              <div className="doc-scope">
                <span>
                  📄 Đang hỏi trong: <strong>{scopedTitle}</strong>
                </span>
                <button
                  type="button"
                  className="btn-link small"
                  onClick={() => {
                    setConvId(null);
                    setMessages([]);
                  }}
                >
                  Hỏi toàn bộ môn
                </button>
              </div>
            )}
            {!empty && <QuickActions compact onSend={quickSend} onFill={fill} />}
            <div className="composer-row">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Nhắn cho EDU-04…"
                id="chat-input"
                aria-label="Nội dung gửi"
                maxLength={5000}
              />
              <button
                type="submit"
                className="send-btn"
                disabled={!input.trim() || !!pending || !courses?.length}
                aria-label="Gửi"
                title="Gửi"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
            <p className="composer-note">
              EDU-04 có thể mắc lỗi — hãy kiểm tra nguồn trích dẫn.
              {courses && courses.length > 0 ? ` Phạm vi: ${courses.map((c) => c.name).join(" · ")}.` : ""}
            </p>
            {empty && <QuickActions onSend={quickSend} onFill={fill} />}
          </form>
        </section>

        <aside
          className={`source-panel${reader || loadingSource || sourceError ? " open" : ""}`}
          aria-label="Nguồn tham chiếu"
        >
          {loadingSource && <div className="skeleton" />}
          {!loadingSource && sourceError && (
            <>
              <div className="source-head">
                <h3>Nguồn tham chiếu</h3>
                <button type="button" className="icon-btn" onClick={() => setSourceError(null)} aria-label="Đóng">
                  ×
                </button>
              </div>
              <div className="banner banner-warning">{sourceError}</div>
            </>
          )}
          {!loadingSource && !sourceError && reader && <SourceReader target={reader} onClose={() => setReader(null)} />}
          {!loadingSource && !sourceError && !reader && (
            <>
              <div className="panel-empty">
                <span className="empty-icon" aria-hidden="true">
                  📖
                </span>
                <h3>Nguồn tham chiếu</h3>
                <p className="muted small">
                  Bấm số trích dẫn <span className="cite static">1</span> trong câu trả lời để mở đúng trang nguồn; rê
                  chuột để xem nhanh đoạn trích.
                </p>
              </div>
            </>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function ContentWithCitations({ text, citations, onCitation }: { text: string; citations: Citation[]; onCitation: (c: Citation) => void }) {
  const byId = new Map(citations.map((c) => [c.id, c]));
  const parts = text.split(/(\[\d{1,2}\])/g);
  return (
    <div className="content">
      {parts.map((p, i) => {
        const m = /^\[(\d{1,2})\]$/.exec(p);
        const c = m ? byId.get(m[1]) : undefined;
        return c ? (
          <CiteChip key={i} c={c} onOpen={onCitation} />
        ) : (
          <Fragment key={i}>{p}</Fragment>
        );
      })}
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = { explain: "Giải thích", quiz: "Tự kiểm tra", plan: "Lộ trình" };

/** Nhãn điều phối theo trace server trả về (AC-11.5): "Router: Academic · Toán rời rạc". */
function routeLabel(m: ChatMessage, courseNames: Map<string, string>): string {
  const r = m.metadata.route;
  const course = m.metadata.course_id ? ` · ${courseNames.get(m.metadata.course_id) ?? m.metadata.course_id}` : "";
  if (!r) return `Trợ lý (${ASSISTANT_LABEL[m.assistant ?? "academic"] ?? m.assistant})`;
  if (r.assistant === "policy") return "Kiểm tra liêm chính";
  if (r.assistant === "clarify") return "Router: cần làm rõ";
  const action = r.action ? ` · ${ACTION_LABEL[r.action] ?? r.action}` : "";
  return `Router: ${ASSISTANT_LABEL[r.assistant] ?? r.assistant}${action}${course}`;
}

function MessageView({
  m,
  courseNames,
  onCitation,
  onHubOpen,
  onChanged,
  onAuthError,
  onPractice,
}: {
  m: ChatMessage;
  courseNames: Map<string, string>;
  onCitation: (c: Citation) => void;
  onHubOpen: (r: HubResult) => void;
  onChanged: () => void;
  onAuthError: (err: unknown) => boolean;
  onPractice: (planId: string, s: PlanSession) => void;
}) {
  if (m.role === "user") {
    return (
      <div className="msg user">
        <div className="bubble">{m.content}</div>
      </div>
    );
  }
  const status = m.status ?? "answered";
  const meta = m.metadata;
  const tone =
    meta.masked
      ? "warning"
      : status === "integrity_redirect"
        ? "integrity"
        : status === "insufficient_evidence" || status === "partial"
          ? "warning"
          : status === "needs_clarification"
            ? "info"
            : "";
  return (
    <div className="msg assistant">
      <div className={`bubble ${tone}`}>
        <div className="assistant-label">
          {routeLabel(m, courseNames)}
          {status !== "answered" && <span className="status-badge">{status}</span>}
        </div>
        <ContentWithCitations text={m.content} citations={m.citations} onCitation={onCitation} />
        {meta.kind === "hub" && meta.results && meta.results.length > 0 && (
          <div className="hub-results">
            {meta.results.map((r) => (
              <div key={r.document_id} className="hub-card">
                <strong>{r.title}</strong>
                <span className="muted small">
                  {" "}
                  · {r.doc_type} · bản {r.version_label} · {r.locator.type === "page" ? "trang" : "slide"} {r.locator.value}
                </span>
                <p className="snippet">“{r.snippet}…”</p>
                <button type="button" className="btn-secondary" onClick={() => onHubOpen(r)}>
                  Mở tài liệu
                </button>
              </div>
            ))}
          </div>
        )}
        {(meta.kind === "quiz" || meta.kind === "diagnose") && meta.questions && (
          <QuizCard m={m} onChanged={onChanged} onAuthError={onAuthError} onCitation={onCitation} />
        )}
        {meta.kind === "flashcards" && meta.items && (
          <FlashcardDeck items={meta.items} citations={m.citations} onCitation={onCitation} />
        )}
        {meta.kind === "cloze" && meta.items && <ClozeCard items={meta.items} citations={m.citations} onCitation={onCitation} />}
        {meta.kind === "triage" && meta.sections && (
          <TriageCard sections={meta.sections} notes={meta.notes ?? []} citations={m.citations} onCitation={onCitation} />
        )}
        {meta.kind === "plan" && meta.plan && <PlanCard plan={meta.plan} onChanged={onChanged} onAuthError={onAuthError} onPractice={onPractice} />}
        {m.citations.length > 0 && (
          <div className="sources-line">
            Nguồn:{" "}
            {m.citations.map((c) => (
              <button key={c.citation_id} type="button" className="cite" onClick={() => onCitation(c)} title={c.quote}>
                [{c.id}]
              </button>
            ))}
          </div>
        )}
        {m.answer_id && !meta.masked && <FeedbackBox answerId={m.answer_id} onAuthError={onAuthError} />}
      </div>
    </div>
  );
}

function QuizCard({
  m,
  onChanged,
  onAuthError,
  onCitation,
}: {
  m: ChatMessage;
  onChanged: () => void;
  onAuthError: (e: unknown) => boolean;
  onCitation: (c: Citation) => void;
}) {
  const byOrdinal = new Map(m.citations.map((c) => [Number(c.id), c]));
  const qs = m.metadata.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>(m.metadata.answers ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const assessment = m.metadata.assessment;

  async function save(submit: boolean) {
    setBusy(true);
    setErr(null);
    try {
      await api(`/learning/quizzes/${m.message_id}/answers`, { method: "POST", body: json({ answers, submit }) });
      onChanged();
    } catch (e) {
      if (!onAuthError(e)) setErr(e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError);
    } finally {
      setBusy(false);
    }
  }

  const done = qs.filter((q) => (answers[q.id] ?? "").trim()).length;
  return (
    <div className="card-inline">
      {qs.map((q, i) => (
        <div key={q.id} className="quiz-q">
          <div className="muted small">
            Câu {i + 1}/{qs.length} · Chủ đề: {q.topic}
          </div>
          <p>{q.question}</p>
          <textarea
            value={answers[q.id] ?? ""}
            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            rows={2}
            aria-label={`Câu trả lời câu ${i + 1}`}
          />
        </div>
      ))}
      <div className="row">
        <span className="muted small">
          Tiến độ: {done}/{qs.length}
        </span>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void save(false)}>
          Lưu tạm
        </button>
        <button type="button" disabled={busy || done === 0} onClick={() => void save(true)}>
          {busy ? "Đang đánh giá…" : "Gửi để đánh giá"}
        </button>
      </div>
      {err && <div className="banner banner-error">{err}</div>}
      {assessment && (
        <div className="assessment">
          <h4>
            {m.metadata.kind === "diagnose" ? "Chẩn đoán: bạn nên bắt đầu từ đâu" : "Mức hiểu theo chủ đề"} (gợi ý học tập,
            không phải điểm chính thức)
          </h4>
          <ul>
            {assessment.topics.map((t, i) => (
              <li key={i}>
                <strong>{t.topic}</strong>: {LEVEL_LABEL[t.level] ?? t.level}
                {t.rationale && <> — {t.rationale}</>}
                {t.review && <div className="muted small">Xem lại: {t.review}</div>}
                {t.review_citations && t.review_citations.length > 0 && (
                  <div className="review-go">
                    Đọc đoạn này trước rồi quay lại:{" "}
                    {t.review_citations.map((n) => {
                      const c = byOrdinal.get(n);
                      return c ? (
                        <button key={n} type="button" className="btn-link" onClick={() => onCitation(c)}>
                          {c.locator.type === "page" ? "trang" : "slide"} {c.locator.value} [{n}]
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const SESSION_LABEL: Record<string, string> = { not_started: "Chưa học", in_progress: "Đang học", done: "Đã hoàn thành" };

/** Link "thêm sự kiện" của Google Calendar (không cần đăng nhập ứng dụng); giờ theo múi Asia/Ho_Chi_Minh. */
function gcalLink(title: string, details: string, begin: Date, minutes: number): string {
  const f = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T` +
    `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
  const end = new Date(begin.getTime() + minutes * 60_000);
  const q = new URLSearchParams({ action: "TEMPLATE", text: title, details, dates: `${f(begin)}/${f(end)}`, ctz: "Asia/Ho_Chi_Minh" });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** Giờ bắt đầu từng buổi — cùng quy tắc với file .ics phía server: ngày 1 = ngày bắt đầu, buổi cùng ngày nối tiếp. */
function sessionStarts(sessions: PlanSession[], start: string, at: string): Map<string, Date> {
  const out = new Map<string, Date>();
  const used = new Map<number, number>();
  const [y, mo, d] = start.split("-").map(Number);
  const [h, mi] = at.split(":").map(Number);
  for (const s of sessions.slice().sort((a, b) => a.day - b.day || a.id.localeCompare(b.id))) {
    const off = used.get(s.day) ?? 0;
    out.set(s.id, new Date(y, mo - 1, d + s.day - 1, h, mi + off));
    used.set(s.day, off + s.minutes);
  }
  return out;
}

function tomorrow(): string {
  const t = new Date(Date.now() + 86_400_000);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function PlanCard({
  plan,
  onChanged,
  onAuthError,
  onPractice,
}: {
  plan: Plan;
  onChanged: () => void;
  onAuthError: (e: unknown) => boolean;
  onPractice: (planId: string, s: PlanSession) => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [start, setStart] = useState(tomorrow());
  const [at, setAt] = useState("19:00");
  const starts = start && at ? sessionStarts(plan.sessions, start, at) : new Map<string, Date>();
  async function call(method: "POST" | "PATCH", path: string, body?: unknown) {
    setErr(null);
    try {
      await api(path, { method, body: body === undefined ? undefined : json(body) });
      onChanged();
    } catch (e) {
      if (!onAuthError(e)) setErr(e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError);
    }
  }
  const active = plan.status === "Confirmed" || plan.status === "InProgress";
  const exportable = active || plan.status === "Paused";
  async function downloadIcs() {
    setErr(null);
    try {
      await downloadFile(`/learning/plans/${plan.id}/calendar.ics?start=${start}&at=${at}`, `lo-trinh-${plan.id}.ics`);
    } catch (e) {
      if (!onAuthError(e)) setErr(e instanceof ApiError ? errorMessage(e.code) : MSG.serviceError);
    }
  }
  return (
    <div className="card-inline plan">
      <div className="row between">
        <strong>LỘ TRÌNH — {plan.goal}</strong>
        <span className="status-badge">
          {plan.status} · v{plan.version}
        </span>
      </div>
      {plan.sessions
        .slice()
        .sort((a, b) => a.day - b.day)
        .map((s) => (
          <div key={s.id} className={`plan-session${s.needs_update ? " stale" : ""}`}>
            <div>
              <strong>
                Ngày {s.day} ({s.minutes}′) — {s.title}
              </strong>
              <div className="small">{s.objective}</div>
              <div className="muted small">
                {s.activity} · Tự kiểm tra: {s.self_check}
                {s.sources.length > 0 && <> · Nguồn: {s.sources.map((n) => `[${n}]`).join(" ")}</>}
              </div>
              {s.missing_source && <div className="warn small">⚠ Thiếu nguồn cho buổi này</div>}
              {s.needs_update && <div className="warn small">⚠ Nguồn đã thay đổi quyền/thu hồi — cần cập nhật</div>}
              {exportable && (
                <div className="plan-session-actions">
                  <button type="button" className="btn-secondary" onClick={() => onPractice(plan.id, s)}>
                    📝 Ôn tập
                  </button>
                  {starts.get(s.id) && (
                    <a
                      className="btn-link small"
                      target="_blank"
                      rel="noopener noreferrer"
                      href={gcalLink(
                        `EDU-04 · Ngày ${s.day}: ${s.title}`,
                        `Mục tiêu: ${s.objective}\nHoạt động: ${s.activity}\nÔn tập: mở lộ trình trong EDU-04, bấm "Ôn tập" ngày ${s.day}.`,
                        starts.get(s.id) as Date,
                        s.minutes,
                      )}
                    >
                      + Google Calendar
                    </a>
                  )}
                </div>
              )}
            </div>
            {active && (
              <select
                value={s.status}
                onChange={(e) => void call("PATCH", `/learning/plans/${plan.id}/sessions/${s.id}`, { status: e.target.value })}
                aria-label={`Trạng thái buổi ngày ${s.day}`}
              >
                {Object.entries(SESSION_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      {plan.warnings.map((w, i) => (
        <div key={i} className="warn small">
          ⚠ {w}
        </div>
      ))}
      <div className="row between">
        <span className="small">
          Tổng thời lượng: {plan.total_minutes} / {plan.budget_minutes} phút cho phép
        </span>
        {plan.status === "Draft" && (
          <button type="button" onClick={() => void call("POST", `/learning/plans/${plan.id}/confirm`)}>
            Xác nhận kế hoạch
          </button>
        )}
        {active && (
          <span className="row">
            <button type="button" className="btn-secondary" onClick={() => void call("POST", `/learning/plans/${plan.id}/status`, { status: "Paused" })}>
              Tạm dừng
            </button>
            <button type="button" className="btn-secondary" onClick={() => void call("POST", `/learning/plans/${plan.id}/status`, { status: "Cancelled" })}>
              Hủy
            </button>
          </span>
        )}
        {plan.status === "Paused" && (
          <button type="button" className="btn-secondary" onClick={() => void call("POST", `/learning/plans/${plan.id}/status`, { status: "InProgress" })}>
            Tiếp tục
          </button>
        )}
      </div>
      {plan.status === "Draft" && (
        <p className="muted small">
          Muốn sửa mục tiêu/thời gian: gửi lại yêu cầu Lộ trình với thông số mới. Xác nhận kế hoạch để đưa vào Google
          Calendar và làm bài ôn tập theo ngày.
        </p>
      )}
      {exportable && (
        <div className="plan-calendar">
          <strong className="small">Đưa lộ trình vào Google Calendar</strong>
          <div className="row">
            <label className="small">
              Bắt đầu ngày <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="small">
              lúc <input type="time" value={at} onChange={(e) => setAt(e.target.value)} />
            </label>
            <button type="button" disabled={!start || !at} onClick={() => void downloadIcs()}>
              Tải file lịch (.ics)
            </button>
          </div>
          <p className="muted small">
            Nhập cả lộ trình: tải file rồi mở{" "}
            <a href="https://calendar.google.com/calendar/r/settings/export" target="_blank" rel="noopener noreferrer">
              Google Calendar → Cài đặt → Nhập
            </a>
            . Hoặc bấm &quot;+ Google Calendar&quot; ở từng buổi. Mỗi buổi có nhắc trước 15 phút.
          </p>
        </div>
      )}
      {err && <div className="banner banner-error">{err}</div>}
    </div>
  );
}

const REPORT_TYPES = ["knowledge_error", "missing_source", "wrong_citation", "wrong_scope", "ui_error", "other"];

function FeedbackBox({ answerId, onAuthError }: { answerId: string; onAuthError: (e: unknown) => boolean }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("knowledge_error");
  const [note, setNote] = useState("");
  const [share, setShare] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function submit(t: string, withNote: boolean) {
    try {
      await api(`/answers/${answerId}/feedback`, {
        method: "POST",
        body: json({ type: t, note: withNote ? note || null : null, share_content: withNote && share }),
      });
      setSent("Đã ghi nhận phản hồi. Cảm ơn bạn!");
      setOpen(false);
    } catch (e) {
      if (!onAuthError(e)) setSent(MSG.serviceError);
    }
  }

  if (sent) return <div className="muted small">{sent}</div>;
  return (
    <div className="feedback">
      <button type="button" className="btn-link" onClick={() => void submit("helpful", false)}>
        Hữu ích
      </button>
      <button type="button" className="btn-link" onClick={() => setOpen(!open)}>
        Báo lỗi
      </button>
      {open && (
        <div className="card-inline">
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Loại lỗi">
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {FEEDBACK_LABEL[t]}
              </option>
            ))}
          </select>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (tùy chọn)" />
          <label className="small">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Chia sẻ câu hỏi và câu trả lời này với
            Giảng viên
          </label>
          {share && (
            <p className="muted small">
              Chỉ câu hỏi và câu trả lời của lượt này được gửi — không gửi toàn bộ hội thoại (FR-05.6).
            </p>
          )}
          <button type="button" onClick={() => void submit(type, true)}>
            Gửi phản hồi
          </button>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatInner />
    </Suspense>
  );
}
