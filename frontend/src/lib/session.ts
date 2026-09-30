// Token: sessionStorage (bản cũ) hoặc localStorage["token"] do trang đăng nhập TV4 ghi — dùng chung một phiên
// sau khi gộp nhánh integration/frontend-backend (log 25). Server vẫn kiểm tra token ở mọi request (BR-02).
const KEY = "edu04.access_token";
const TV4_KEY = "token";

export function getToken(): string | null {
  try {
    return window.sessionStorage.getItem(KEY) ?? window.localStorage.getItem(TV4_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    window.sessionStorage.setItem(KEY, token);
  } catch {
    // Trình duyệt chặn storage: phiên chỉ sống trong trang hiện tại.
  }
}

export function clearToken(): void {
  try {
    window.sessionStorage.removeItem(KEY);
    window.localStorage.removeItem(TV4_KEY);
    window.localStorage.removeItem("user");
  } catch {
    // bỏ qua
  }
}
