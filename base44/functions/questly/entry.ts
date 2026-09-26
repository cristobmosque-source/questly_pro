// API DE QUESTLY — único punto de entrada del servidor.
// Recibe { path, method, body, token } y responde { ok, data } o
// { ok: false, error: { message, status } }. Todo el progreso, el historial y
// la configuración viven en la base de datos real de Base44: nada se guarda en
// el navegador. La autenticación es la propia de Questly (sesión por token).

import { createClientFromRequest } from "npm:@base44/sdk@0.8.49";
import { ApiError } from "../../shared/questlyDomain.ts";
import { handle } from "../../shared/questlyRoutes.ts";
import { loadState, persistState, importSnapshot } from "../../shared/questlyStore.ts";

// La plataforma limita la cantidad de lecturas de base de datos por minuto.
// Cargar el estado completo (17 lecturas) en CADA petición agotaba esa cuota en
// segundos y devolvía "Rate limit exceeded" aunque la operación hubiera
// terminado bien. Esta caché de muy corta vida reutiliza el estado recién
// cargado entre peticiones cercanas y comparte la carga entre peticiones
// simultáneas (p. ej. la página que pide /me y /kid/home a la vez). Cada
// petición trabaja sobre su propia copia y la caché se refresca tras cada
// escritura: el comportamiento no cambia.
let cache = null; // { state, ids, at } — state nunca se muta, solo se reemplaza
let loading = null; // carga en vuelo, compartida entre peticiones simultáneas
const CACHE_TTL_MS = 10000;

async function getState(base44) {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { state: structuredClone(cache.state), ids: cache.ids };
  }
  if (!loading) {
    loading = loadState(base44).then(
      (loaded) => {
        cache = { state: loaded.state, ids: loaded.ids, at: Date.now() };
        loading = null;
      },
      (error) => {
        loading = null;
        throw error;
      },
    );
  }
  await loading;
  return { state: structuredClone(cache.state), ids: cache.ids };
}

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
      cache = null;
      return Response.json({ ok: true, data: result });
    }

    const { state, ids } = await getState(base44);
    const before = structuredClone(state);
    const result = await handle(state, method, path, body, token);
    await persistState(base44, before, state, ids);
    // la caché queda con el estado ya escrito: las lecturas siguientes lo ven
    cache = { state, ids, at: Date.now() };
    return Response.json({ ok: true, data: result });
  } catch (error) {
    // Error de negocio (ApiError): no se escribió nada; la caché sigue válida.
    // Cualquier otro error invalida la caché para recargar estado fresco.
    if (!(error instanceof ApiError)) cache = null;
    const status = error instanceof ApiError ? error.status : 500;
    return Response.json({
      ok: false,
      error: { message: error.message || "Error interno", status },
    });
  }
}