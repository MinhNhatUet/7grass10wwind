type StatusInfo = { label: string; hint: string; color: string; step: number };
const statuses: Record<string, StatusInfo> = {
  Processing: { label: "Đang trích xuất", hint: "Đang đọc file và tách nội dung. Chưa thể gửi duyệt hoặc dùng trong Chat AI.", color: "bg-slate-200 text-slate-800", step: 0 },
  Draft: { label: "Bản nháp", hint: "Đã trích xuất. Kiểm tra nội dung, lưu metadata rồi gửi duyệt.", color: "bg-slate-200 text-slate-800", step: 1 },
  NeedsReview: { label: "Cần kiểm tra chất lượng", hint: "Có cảnh báo trích xuất. Kiểm tra các trang được đánh dấu trước khi gửi duyệt.", color: "bg-amber-100 text-amber-900", step: 1 },
  PendingApproval: { label: "Chờ người duyệt", hint: "Đang chờ người được phân công duyệt. Người tải lên không được tự duyệt.", color: "bg-amber-100 text-amber-900", step: 2 },
  Approved: { label: "Đã duyệt · chờ lập chỉ mục", hint: "Đã được duyệt nhưng chưa sẵn sàng cho Chat AI. Cần hoàn tất embedding.", color: "bg-indigo-100 text-indigo-800", step: 3 },
  Indexing: { label: "Đang lập chỉ mục", hint: "Đang tạo embedding. Chỉ khi hoàn tất và phát hành thì Chat AI mới dùng được.", color: "bg-indigo-100 text-indigo-800", step: 3 },
  Published: { label: "Đã phát hành", hint: "Đã hoàn tất duyệt và lập chỉ mục. Khả năng phục vụ còn phụ thuộc bản hiện hành và khóa tài liệu.", color: "bg-emerald-100 text-emerald-800", step: 4 },
  Failed: { label: "Xử lý thất bại", hint: "Chưa sẵn sàng. Kiểm tra lỗi xử lý và thử lại; không cần tải lại file nếu bản gốc vẫn hợp lệ.", color: "bg-red-100 text-red-800", step: -1 },
  Rejected: { label: "Bị từ chối", hint: "Xem lý do từ chối, chỉnh sửa bản nháp và gửi duyệt lại.", color: "bg-red-100 text-red-800", step: -1 },
  Withdrawn: { label: "Đã thu hồi", hint: "Nguồn này không còn phục vụ Chat AI.", color: "bg-orange-100 text-orange-900", step: -1 },
  Archived: { label: "Đã lưu trữ", hint: "Đây không còn là phiên bản đang phục vụ. Hãy xem phiên bản hiện hành.", color: "bg-slate-200 text-slate-800", step: -1 },
};
export function StatusBadge({ state }: { state: string }) {
  const info = statuses[state];
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${info?.color || "bg-slate-100 text-slate-800"}`}>{info?.label || state}</span>;
}
export function DocumentStatus({ state, current, locked }: { state: string; current?: boolean; locked?: boolean }) {
  const info = statuses[state];
  const available = state === "Published" && current === true && locked === false;
  return <section aria-label="Trạng thái tài liệu" className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><StatusBadge state={state} /><strong className={available ? "text-emerald-600 text-sm" : "text-amber-600 text-sm"}>{available ? "✓ Sẵn sàng cho Chat AI (theo quyền đọc)" : "Chưa phục vụ Chat AI từ phiên bản này"}</strong></div>
    <p className="text-sm text-slate-600 dark:text-slate-300">{locked ? "Tài liệu đang bị khóa khẩn cấp, không phục vụ dù đã phát hành." : available ? "Phiên bản hiện hành đã phát hành. Người có quyền đọc có thể tra cứu trong Hub và Chat AI." : info?.hint || "Trạng thái chưa xác định; hãy tải lại dữ liệu."}</p>
    <ol className="grid grid-cols-2 sm:grid-cols-5 gap-2">{["Trích xuất", "Kiểm tra nháp", "Chờ duyệt", "Lập chỉ mục", "Phát hành"].map((label, i) => <li key={label} aria-current={info?.step === i ? "step" : undefined} className={`rounded-xl p-3 text-xs border ${info && info.step === i ? "border-slate-800 bg-slate-100 text-slate-900 font-semibold" : info && info.step > i ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-500 dark:border-slate-700"}`}><span className="block mb-1 font-bold">{info && info.step > i ? "✓" : i + 1}</span>{label}{info?.step === i && <span className="block mt-1">Hiện tại</span>}</li>)}</ol>
    <p className="text-xs text-slate-500">Trạng thái do máy chủ xác nhận. Đã duyệt ≠ Đã phát hành. Các bước không biểu thị phần trăm xử lý.</p>
  </section>;
}
