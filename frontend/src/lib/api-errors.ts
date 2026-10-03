export const API = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1`;

const messages: Record<string, string> = {
  EMBEDDING_RATE_LIMITED: "Dịch vụ tạo chỉ mục đang giới hạn lượt gọi. Vui lòng chờ rồi thử lại.",
  EMBEDDING_UNAVAILABLE: "Chưa kết nối được dịch vụ tìm kiếm tài liệu. Vui lòng thử lại sau.",
  LLM_UNAVAILABLE: "AI đang tạm thời không khả dụng. Vui lòng thử lại sau.",
  QUOTA_EXCEEDED: "Bạn đã hết lượt hỏi trong ngày. Vui lòng quay lại sau.",
  SOURCE_UNAVAILABLE: "Tài liệu đã bị thu hồi, thay phiên bản hoặc bạn không còn quyền đọc.",
  COURSE_NOT_ALLOWED: "Bạn chưa được cấp quyền truy cập môn học này.",
  PAGE_RENDER_FAILED: "Không thể hiển thị ảnh trang PDF. Bạn có thể xem nội dung trích xuất bên dưới.",
  PAGE_IMAGE_UNSUPPORTED: "Định dạng này chưa hỗ trợ ảnh trang. Hiển thị nội dung trích xuất.",
  APPROVAL_REVISION_MISMATCH: "Phiên bản đã thay đổi sau khi duyệt; cần kiểm tra và duyệt lại.",
  DB_UNAVAILABLE: "Cơ sở dữ liệu tạm thời không phản hồi. Vui lòng thử lại sau.",
  TOO_MANY_REGISTRATIONS: "Có quá nhiều lượt đăng ký từ thiết bị này. Vui lòng thử lại sau.",
};

export function errorCodeMessage(code?: string) {
  return code ? messages[code] || `Thao tác thất bại (${code}).` : "Không thể kết nối máy chủ. Vui lòng thử lại.";
}

export async function responseError(response: Response): Promise<Error> {
  if (response.status === 401) return new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  if (response.status === 404 || response.status === 403) return new Error("Không tìm thấy hoặc bạn không có quyền truy cập nội dung này.");
  const data = await response.json().catch(() => ({}));
  const message = data.error?.message || errorCodeMessage(data.error?.code);
  // lỗi máy chủ: kèm mã hỗ trợ để tra log (X-Request-ID)
  const rid = response.headers.get("X-Request-ID") || data.error?.request_id;
  return new Error(response.status >= 500 && rid ? `${message} (Mã hỗ trợ: ${rid})` : message);
}

export function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("token") || ""}` };
}
