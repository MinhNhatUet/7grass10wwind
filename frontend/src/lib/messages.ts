// Microcopy theo Wireframe & UI flow mục 8 (8.1 nguyên văn PRD 8.4; 8.2 là đề xuất, cần chốt cùng nhóm).
export const MSG = {
  invalidCredentials: "Định danh hoặc mật khẩu không đúng.",
  sessionExpired: "Phiên làm việc đã hết hạn, vui lòng đăng nhập lại.",
  noCourses:
    "Bạn chưa được cấp quyền vào môn nào. Vui lòng liên hệ Giảng viên hoặc Quản trị để được cấp quyền.",
  tooManyAttempts: "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.",
  serviceError: "Chưa thể kết nối hệ thống lúc này. Bạn có thể thử lại sau.",
  answerServiceError:
    "Chưa thể tạo câu trả lời lúc này. Bạn có thể thử lại hoặc tìm tài liệu trong Knowledge Hub.",
  sourceWithdrawn: "Nguồn này hiện không còn khả dụng. Hãy tìm phiên bản đang được phép sử dụng.",
  quotaExceeded: "Bạn đã dùng hết hạn mức câu hỏi trong ngày. Vui lòng thử lại sau.",
  forbidden: "Bạn không có quyền thực hiện thao tác này.",
  notAssignedReview: "Bạn không được phân công duyệt tài liệu này.",
  unlabeled: "Chưa gắn nhãn học liệu/bài tập/đáp án — tài liệu không được mặc định coi là an toàn để công bố.",
} as const;

export const ROLE_LABEL: Record<string, string> = {
  student: "Sinh viên",
  lecturer: "Giảng viên",
  reviewer: "Giảng viên duyệt",
  admin: "Quản trị",
};

export const ASSISTANT_LABEL: Record<string, string> = {
  auto: "Tự động",
  academic: "Academic",
  learning: "Learning",
  hub: "Knowledge Hub",
};

export const STATE_LABEL: Record<string, string> = {
  Draft: "Nháp",
  Processing: "Đang xử lý",
  NeedsReview: "Cần xem lại",
  PendingApproval: "Chờ duyệt",
  Rejected: "Bị từ chối",
  Approved: "Đã duyệt",
  Indexing: "Đang index",
  Published: "Đã phát hành",
  Failed: "Lỗi",
  Withdrawn: "Đã thu hồi",
  Archived: "Lưu trữ",
};

export const LEVEL_LABEL: Record<string, string> = {
  solid: "Đã thể hiện ý cốt lõi",
  needs_reinforcement: "Cần củng cố",
  missing_foundation: "Thiếu nền tảng",
  insufficient_data: "Chưa đủ bằng chứng",
};

export const FEEDBACK_LABEL: Record<string, string> = {
  knowledge_error: "Lỗi kiến thức",
  missing_source: "Thiếu nguồn",
  wrong_citation: "Sai citation",
  wrong_scope: "Sai phạm vi",
  ui_error: "Lỗi giao diện",
  other: "Khác",
  helpful: "Hữu ích",
  not_helpful: "Không hữu ích",
};

/** Thông báo cho lỗi kỹ thuật theo mã (PRD 11.4) — không hiển thị trace/secret. */
export function errorMessage(code: string): string {
  const map: Record<string, string> = {
    LLM_UNAVAILABLE: MSG.answerServiceError,
    LOGIN_ID_TAKEN: "Định danh này đã có người dùng.",
    EMBEDDING_QUOTA: "Dịch vụ tìm nguồn đã hết hạn mức sử dụng hôm nay. Vui lòng thử lại sau.",
    EMBEDDING_UNAVAILABLE: "Chưa thể tìm nguồn lúc này. Bạn có thể thử lại.",
    NETWORK_ERROR: MSG.serviceError,
    NOT_FOUND: "Không tìm thấy nội dung, hoặc bạn không có quyền truy cập.",
    QUOTA_EXCEEDED: MSG.quotaExceeded,
    FORBIDDEN: MSG.forbidden,
    REVIEW_NOT_ASSIGNED: MSG.notAssignedReview,
    SELF_APPROVAL_NOT_ALLOWED: "Người tải lên không được tự duyệt tài liệu của mình.",
    REVISION_CONFLICT: "Tài liệu đã được sửa sau khi bạn mở. Hãy tải lại và kiểm tra bản mới nhất.",
    SOURCE_UNAVAILABLE: MSG.sourceWithdrawn,
    DUPLICATE_FILE: "Tệp này đã có trong môn.",
    UNSUPPORTED_FILE_TYPE: "Chỉ nhận PDF hoặc PPTX (kiểm tra theo nội dung tệp, không theo đuôi).",
    FILE_TOO_LARGE: "Tệp vượt giới hạn dung lượng.",
    TOO_MANY_PAGES: "Tệp vượt giới hạn số trang/slide.",
    ENCRYPTED_FILE: "Tệp có mật khẩu — không xử lý được.",
    CORRUPT_FILE: "Tệp bị hỏng hoặc không đọc được.",
    MACRO_NOT_ALLOWED: "Tệp chứa macro — không được chấp nhận.",
    USAGE_PERMISSION_NOT_CONFIRMED: "Chưa xác nhận quyền sử dụng nguồn — chỉ được giữ ở bản nháp.",
    MISSING_ACL: "Chưa chọn đối tượng được đọc.",
    NO_EXTRACTED_TEXT: "Tài liệu không có nội dung đọc được — cần sửa/thay tệp trước khi gửi duyệt.",
    QUALITY_WARNINGS_NOT_ACKNOWLEDGED: "Cần xác nhận đã kiểm tra các trang có cảnh báo trước khi gửi duyệt.",
    REASON_REQUIRED: "Cần nhập lý do.",
    UPLOAD_NOT_ALLOWED: "Bạn không được phân công tải tài liệu cho môn này.",
    WITHDRAW_NOT_ALLOWED: "Bạn không có quyền thu hồi trong môn này.",
    INVALID_STATE: "Trạng thái hiện tại không cho phép thao tác này.",
    PLAN_NOT_ACTIVE: "Kế hoạch chưa được xác nhận hoặc đã kết thúc.",
    IDEMPOTENCY_KEY_REUSED: "Yêu cầu trùng mã với yêu cầu khác. Hãy thử lại.",
  };
  // Chỉ lỗi mạng thật mới báo "chưa kết nối được"; mã khác hiện kèm mã để tra (trước đây 404 cũng bị báo mất kết nối)
  return map[code] ?? `Chưa thực hiện được thao tác (mã ${code}). Bạn có thể thử lại sau.`;
}

export const DOC_TYPE_LABEL: Record<string, string> = {
  textbook: "Giáo trình",
  slide: "Slide",
  exercise: "Bài tập",
  reference: "Tham khảo",
  syllabus: "Đề cương",
  other: "Khác",
};
