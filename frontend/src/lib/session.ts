// Shared with the Vedu login/profile pages. Never keep a second, stale session token.
export function getToken(): string | null {
  try { return window.localStorage.getItem("token"); } catch { return null; }
}

export function setToken(token: string): void {
  window.localStorage.setItem("token", token);
  window.sessionStorage.removeItem("edu04.access_token");
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem("token");
    window.localStorage.removeItem("user");
    window.sessionStorage.removeItem("edu04.access_token");
  } catch { /* Storage may be unavailable. */ }
}
