// CAPA DE SERVICIOS DE QUESTLY — la única fuente de datos es la base de datos
// real del servidor (función backend "questly"). El navegador solo conserva
// el token de sesión (una credencial, no datos de la app).

import { base44 } from "@/api/base44Client";
import { ApiError } from "@/services/error";
import { getToken } from "@/services/session";

export { ApiError } from "@/services/error";
export { getToken, getSessionUser, setSession, clearSession } from "@/services/session";

const RATE_LIMIT_RE = /rate limit|too many requests|429/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// El servidor limita la frecuencia de peticiones (HTTP 429). Si ocurre,
// esperamos y reintentamos: la operación no se duplica, porque el servidor
// valida el estado antes de escribir (si el primer intento llegó a guardarse,
// el reintento recibe la respuesta de validación, no un segundo registro).
export async function api(path, opts = {}) {
  const method = opts.method || "GET";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(attempt === 1 ? 1500 : 3000);
    let res;
    try {
      res = await base44.functions.invoke("questly", {
        path,
        method,
        body: opts.body || {},
        token: getToken(),
      });
    } catch (e) {
      const limited = (e && e.status === 429) || RATE_LIMIT_RE.test((e && e.message) || "");
      if (limited && attempt < 2) continue;
      throw new ApiError("No se pudo conectar con el servidor. Revisa tu conexión e inténtalo otra vez.", { status: 0, network: true });
    }
    const payload = res.data;
    if (payload && payload.ok === false) {
      const message = (payload.error && payload.error.message) || "Error inesperado";
      const status = (payload.error && payload.error.status) || 500;
      if (RATE_LIMIT_RE.test(message) && attempt < 2) continue;
      throw new ApiError(message, { status });
    }
    return payload.data;
  }
  throw new ApiError("El servidor está un poco ocupado. Espera unos segundos y vuelve a intentarlo.", { status: 429, rateLimit: true });
}

// Avisan a los layouts que hay datos frescos (puntos, aprobaciones).
// Si la operación ya devolvió los puntos frescos, se adjuntan al evento para
// que la cabecera no tenga que pedirlos otra vez al servidor.
export function notifyPointsChanged(points) {
  window.dispatchEvent(new CustomEvent("questly:points", {
    detail: typeof points === "number" ? { points } : {},
  }));
}
// Igual que los puntos: si la operación ya trae el conteo fresco de
// pendientes, se adjunta al evento para no pedirlo otra vez al servidor.
export function notifyApprovalsChanged(pending) {
  window.dispatchEvent(new CustomEvent("questly:approvals", {
    detail: typeof pending === "number" ? { pending } : {},
  }));
}

// ---------------------------------------------------------------------------
// formato compartido
// ---------------------------------------------------------------------------

// 1000 puntos = $1.000: la estrella sigue siendo el icono del sistema, pero
// cada cifra de puntos puede mostrarse también como pesos chilenos.
export function fmtPoints(value) {
  const n = Number(value || 0);
  return n.toLocaleString("es-CL", { maximumFractionDigits: 1 });
}

export function fmtMoney(value) {
  return "$" + fmtPoints(value);
}

export function fmtSigned(delta) {
  const v = Number(delta || 0);
  return (v > 0 ? "+" : "-") + fmtPoints(Math.abs(v));
}

export function fmtDateLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00Z");
  if (isNaN(d.getTime())) return dateStr;
  const s = d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
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