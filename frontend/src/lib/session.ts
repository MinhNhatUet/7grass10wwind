// Token lưu trong sessionStorage: mất khi đóng tab, không dùng localStorage cho MVP.
const KEY = "edu04.access_token";

export function getToken(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
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
  } catch {
    // bỏ qua
  }
}
