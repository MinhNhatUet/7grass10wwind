// Shared FastAPI endpoint and session across Vedu and the integrated workflows.
import { clearToken, getToken } from "./session";
import { API } from "./api-errors";

export type Role = "student" | "lecturer" | "reviewer" | "admin";

export interface UserPublic {
  id: string;
  login_id: string;
  display_name: string;
  role: Role;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user: UserPublic;
}

export interface MeResponse {
  user: UserPublic;
  roles: Role[];
  session: { expires_at: string };
}

export interface CourseItem {
  id: string;
  code: string | null;
  name: string;
  term: string | null;
  assigned: boolean;
  can_upload: boolean;
  can_review: boolean;
}

export interface Locator {
  type: "page" | "slide";
  value: number;
}

export interface Citation {
  id: string;
  citation_id: string;
  document_id: string;
  version_id: string;
  chunk_id: string;
  locator: Locator;
  quote: string;
}

export type AssistantName = "academic" | "learning" | "hub";
export type BusinessStatus =
  | "answered"
  | "partial"
  | "needs_clarification"
  | "insufficient_evidence"
  | "integrity_redirect";

/** Một tài liệu đã phát hành trong Thư viện (GET /documents — server chỉ trả bản được phép đọc). */
export interface LibraryItem {
  document_id: string;
  version_id: string;
  course_id: string;
  title: string;
  doc_type: string;
  version_label: string;
  chapter: string | null;
  file_type: string;
  page_count: number | null;
  published_at: string | null;
  can_download: boolean;
}

export interface HubResult {
  document_id: string;
  version_id: string;
  chunk_id: string;
  title: string;
  doc_type: string;
  version_label: string;
  chapter: string | null;
  snippet: string;
  locator: Locator;
  can_download: boolean;
}

export interface QuizQuestion {
  id: string;
  topic: string;
  objective: string;
  question: string;
  sources: number[];
}

export interface PlanSession {
  id: string;
  day: number;
  title: string;
  objective: string;
  minutes: number;
  activity: string;
  self_check: string;
  sources: number[];
  missing_source: boolean;
  status: "not_started" | "in_progress" | "done";
  needs_update: boolean;
}

/** Flashcard (front/back) hoặc câu điền khuyết (sentence/answer/hint); sources = số [n] của câu trả lời. */
export interface StudyItem {
  front?: string;
  back?: string;
  sentence?: string;
  answer?: string;
  hint?: string;
  sources: number[];
}

export interface TriageSections {
  definitions: { term?: string; text: string; sources: number[] }[];
  pitfalls: { text: string; sources: number[] }[];
  examples: { title?: string; text: string; sources: number[] }[];
}

export interface Plan {
  id: string;
  version: number;
  previous_id: string | null;
  status: string;
  goal: string;
  days: number;
  minutes_per_day: number;
  sessions: PlanSession[];
  warnings: string[];
  total_minutes: number;
  budget_minutes: number;
}

export interface ChatMessage {
  request_id: string | null;
  answer_id: string | null;
  conversation_id: string;
  message_id: string;
  role: "user" | "assistant";
  assistant: AssistantName | null;
  status: BusinessStatus | null;
  content: string;
  citations: Citation[];
  created_at: string;
  metadata: {
    course_id: string;
    kind?: "hub" | "quiz" | "plan" | "explain" | "diagnose" | "flashcards" | "cloze" | "analogy" | "triage";
    items?: StudyItem[];
    sections?: TriageSections;
    notes?: string[];
    analogy_context?: string;
    masked?: boolean;
    missing?: string[];
    results?: HubResult[];
    topic?: string;
    questions?: QuizQuestion[];
    answers?: Record<string, string>;
    assessment?: {
      topics: {
        topic: string;
        level: string;
        rationale: string;
        review: string;
        review_pages?: number[];
        review_citations?: number[];
      }[];
      unanswered: string[];
    } | null;
    plan_id?: string;
    route?: { mode: "auto" | "manual"; assistant: string; action: string | null; reason: string | null; steps: string[] };
    plan?: Plan | null;
    learning?: unknown;
  };
}

export interface Conversation {
  id: string;
  course_id: string | null;
  document_id: string | null; // D-33: hội thoại hỏi trong một tài liệu
  document_title: string | null;
  assistant_mode: AssistantName;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface SourceView {
  document_id: string;
  version_id: string;
  title: string;
  version_label: string;
  doc_type: string;
  locator: Locator;
  excerpt: string;
  quote?: string; // đoạn hỗ trợ ý được trích (chỉ có khi mở từ citation)
  can_download: boolean;
}

/** Lỗi kỹ thuật theo PRD 11.4: frontend quyết định UI dựa vào `code`, không parse chuỗi. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly detail?: string,
  ) {
    super(code);
  }
}

const BASE = API;

export function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

interface RequestOptions extends RequestInit {
  auth?: boolean;
  idempotencyKey?: string;
}

async function raw(path: string, init: RequestOptions = {}): Promise<Response> {
  const { auth = true, idempotencyKey, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body && !(rest.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  if (auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  let resp: Response;
  try {
    resp = await fetch(`${BASE}${path}`, { ...rest, headers, cache: "no-store" });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", true);
  }
  if (!resp.ok) {
    const body = await resp.json().catch(() => null);
    const err = body?.error;
    const code = typeof err?.code === "string" ? err.code : `HTTP_${resp.status}`;
    if (resp.status === 401 && auth) clearToken();
    throw new ApiError(resp.status, code, Boolean(err?.retryable), err?.message);
  }
  return resp;
}

export async function api<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const resp = await raw(path, init);
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export const json = (body: unknown): string => JSON.stringify(body);

/** Tải file có kiểm tra quyền (Bearer) rồi mở trong tab mới — không tạo link công khai (FR-04.5). */
export async function openFile(path: string): Promise<void> {
  const resp = await raw(path);
  const url = URL.createObjectURL(await resp.blob());
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Tải tài nguyên có kiểm tra quyền (Bearer) thành object URL để hiển thị (vd. ảnh trang); người gọi tự revoke. */
export async function fetchObjectUrl(path: string): Promise<string> {
  const resp = await raw(path);
  return URL.createObjectURL(await resp.blob());
}

/** Tải file có kiểm tra quyền (Bearer) và lưu về máy với tên cho trước (vd. lịch .ics). */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const resp = await raw(path);
  const url = URL.createObjectURL(await resp.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function login(loginId: string, password: string): Promise<LoginResponse> {
  return api<LoginResponse>("/auth/login", {
    method: "POST",
    body: json({ login_id: loginId, password }),
    auth: false,
  });
}

/** Tự đăng ký (D-35): server luôn tạo Sinh viên chưa có môn — không gửi vai trò. */
export function register(loginId: string, password: string, displayName: string): Promise<LoginResponse> {
  return api<LoginResponse>("/auth/register", {
    method: "POST",
    body: json({ login_id: loginId, password, display_name: displayName || null }),
    auth: false,
  });
}

export const logout = (): Promise<void> => api<void>("/auth/logout", { method: "POST" });
export const me = (): Promise<MeResponse> => api<MeResponse>("/me");
export const myCourses = async (): Promise<CourseItem[]> =>
  (await api<{ items: CourseItem[] }>("/me/courses")).items;
