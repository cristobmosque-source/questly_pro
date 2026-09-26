// Cliente del API real de Questly (Flask). Toda la lógica de negocio vive en
// el backend; este módulo solo transporta llamadas JSON.
import { ApiError } from "@/services/error";
import { clearSession, getToken } from "@/services/session";

export const DEFAULT_BASE = "http://localhost:37000";
const BASE_KEY = "questly_api_base";

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

export async function httpApi(path, { method = "GET", body } = {}) {
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