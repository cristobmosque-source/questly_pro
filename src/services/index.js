// CAPA DE SERVICIOS — los componentes React usan `api()` sin saber si los
// datos vienen del modo demo (localStorage) o del backend Flask real.
// El modo se guarda en localStorage y se cambia desde Configuración.

import { demoApi, restoreDemoData } from "@/services/demoApi";
import { httpApi, getApiBase, setApiBase, DEFAULT_BASE } from "@/services/questlyApi";

export { ApiError } from "@/services/error";
export { getToken, getSessionUser, setSession, clearSession } from "@/services/session";

const MODE_KEY = "questly_mode";

export function getMode() {
  try {
    return localStorage.getItem(MODE_KEY) === "api" ? "api" : "demo";
  } catch {
    return "demo";
  }
}

export function isDemoMode() {
  return getMode() === "demo";
}

export function setMode(mode) {
  localStorage.setItem(MODE_KEY, mode === "api" ? "api" : "demo");
}

export { restoreDemoData, getApiBase, setApiBase, DEFAULT_BASE };

export async function api(path, opts) {
  return isDemoMode() ? demoApi(path, opts) : httpApi(path, opts);
}

// Avisan a los layouts que hay datos frescos (puntos, aprobaciones).
export function notifyPointsChanged() {
  window.dispatchEvent(new Event("questly:points"));
}
export function notifyApprovalsChanged() {
  window.dispatchEvent(new Event("questly:approvals"));
}

// ---------------------------------------------------------------------------
// formato compartido
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