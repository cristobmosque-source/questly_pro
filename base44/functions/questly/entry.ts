// API DE QUESTLY — único punto de entrada del servidor.
// Recibe { path, method, body, token } y responde { ok, data } o
// { ok: false, error: { message, status } }. Todo el progreso, el historial y
// la configuración viven en la base de datos real de Base44: nada se guarda en
// el navegador. La autenticación es la propia de Questly (sesión por token).

import { createClientFromRequest } from "npm:@base44/sdk@0.8.49";
import { ApiError } from "../../shared/questlyDomain.ts";
import { handle } from "../../shared/questlyRoutes.ts";
import { loadState, persistState, importSnapshot } from "../../shared/questlyStore.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const path = String(payload.path || "");
    const method = String(payload.method || "GET");
    const body = payload.body || {};
    const token = payload.token || null;

    // migración inicial: sube los datos guardados en el navegador al servidor
    if (method === "POST" && path === "/admin/import") {
      const result = await importSnapshot(base44, body);
      return Response.json({ ok: true, data: result });
    }

    const { state, ids } = await loadState(base44);
    const before = structuredClone(state);
    const result = await handle(state, method, path, body, token);
    await persistState(base44, before, state, ids);
    return Response.json({ ok: true, data: result });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return Response.json({
      ok: false,
      error: { message: error.message || "Error interno", status },
    });
  }
}