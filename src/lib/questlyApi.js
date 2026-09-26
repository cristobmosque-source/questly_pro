// Cliente del API de Questly (Flask). Toda la lógica de negocio vive en el
// backend; este módulo solo transporta llamadas JSON.

const TOKEN_KEY = "questly_token";
const USER_KEY = "questly_user";
const BASE_KEY = "questly_api_base";

export const DEFAULT_BASE = "http://localhost:37000";

export function getApiBase() {
  try {
    return localStorage.getItem(BASE_KEY) || DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

export function setApiBase(url) {
  localStorage.setItem(BASE_KEY, (url || "").trim().replace(/\/+$/, ""));
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getSessionUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  constructor(message, { status = 0, network = false } = {}) {
    super(message);
    this.status = status;
    this.network = network;
  }
}

export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(getApiBase() + "/api/v1" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(getToken() ? { Authorization: "Bearer " + getToken() } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      "No se pudo conectar con el servidor de Questly en " + getApiBase(),
      { network: true }
    );
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta vacía */
  }

  if (!res.ok || (data && data.ok === false)) {
    if (res.status === 401) {
      const wasAuthed = !!getToken();
      clearSession();
      if (wasAuthed) window.location.href = "/";
    }
    throw new ApiError((data && data.error) || "Error " + res.status, {
      status: res.status,
    });
  }
  return data;
}

// Avisan a los layouts que hay datos frescos (puntos, aprobaciones).
export function notifyPointsChanged() {
  window.dispatchEvent(new Event("questly:points"));
}
export function notifyApprovalsChanged() {
  window.dispatchEvent(new Event("questly:approvals"));
}

// ---------------------------------------------------------------------------
// formato
// ---------------------------------------------------------------------------

export function fmtPoints(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : n.toLocaleString("es-CL");
}

export function fmtSigned(delta) {
  const v = Number(delta || 0);
  const abs = Number.isInteger(v) ? String(Math.abs(v)) : Math.abs(v).toLocaleString("es-CL");
  return (v > 0 ? "+" : "-") + abs;
}

export function fmtWhen(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString("es-CL", { day: "numeric", month: "short" }) +
    ", " +
    d.toLocaleTimeString("es-CL", { hour: "numeric", minute: "2-digit" })
  );
}

export function kidGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "¡Buenos días";
  if (h < 20) return "¡Buenas tardes";
  return "¡Buenas noches";
}