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