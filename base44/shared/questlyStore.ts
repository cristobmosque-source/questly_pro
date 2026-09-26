// PERSISTENCIA DE QUESTLY EN LA BASE DE DATOS REAL — carga el estado completo
// desde las entidades, y tras cada operación escribe SOLO lo que cambió
// (crea nuevos, actualiza modificados, borra eliminados). Incluye la
// importación del snapshot de localStorage al primer arranque.

import {
  ApiError, sha256Hex,
  yesterdayStr, buildOnceAssignments, pruneBackups,
} from "./questlyDomain.ts";

// ---------------------------------------------------------------------------
// mapeo registro ↔ entidad (el campo `ref` guarda el id de dominio)
// ---------------------------------------------------------------------------

const BUILTINS = ["id", "ref", "created_date", "updated_date", "created_by_id", "created_by"];

function toDomain(rec) {
  const d = {};
  for (const k of Object.keys(rec)) {
    if (BUILTINS.includes(k)) continue;
    d[k] = rec[k];
  }
  d.id = rec.ref;
  return d;
}

function toEntity(rec) {
  const e = {};
  for (const k of Object.keys(rec)) {
    if (k === "id") continue;
    if (rec[k] === undefined) continue;
    e[k] = rec[k];
  }
  e.ref = rec.id;
  return e;
}

// igualdad estructural ignorando claves con valor undefined
function toEntityComparable(rec) {
  const out = {};
  for (const k of Object.keys(rec)) {
    if (rec[k] === undefined) continue;
    out[k] = rec[k];
  }
  return out;
}

const COLLECTIONS = [
  { key: "kids", entity: "QuestlyKid", limit: 500 },
  { key: "quests", entity: "QuestlyQuest", limit: 2000 },
  { key: "rewards", entity: "QuestlyReward", limit: 1000 },
  { key: "streaks", entity: "QuestlyStreak", limit: 1000 },
  { key: "assignments", entity: "QuestlyAssignment", limit: 5000 },
  { key: "claims", entity: "QuestlyClaim", limit: 10000 },
  { key: "misses", entity: "QuestlyMiss", limit: 10000 },
  { key: "steps", entity: "QuestlyStep", limit: 20000 },
  { key: "txns", entity: "QuestlyTxn", limit: 20000 },
  { key: "redemptions", entity: "QuestlyRedemption", limit: 10000 },
  { key: "pin_requests", entity: "QuestlyPinRequest", limit: 5000 },
  { key: "backups", entity: "QuestlyBackup", limit: 200 },
];

export function emptyState() {
  return {
    parent: null,
    kids: [], quests: [], rewards: [], streaks: [], streak_progress: {},
    pin_requests: [], backups: [], assignments: [], claims: [], misses: [],
    steps: [], txns: [], redemptions: [], sessions: {},
  };
}

// ---------------------------------------------------------------------------
// carga
// ---------------------------------------------------------------------------

export async function loadState(base44) {
  const S = base44.asServiceRole.entities;
  const state = emptyState();
  const ids = { parent: null, streak_progress: {}, sessions: {} };
  // Las lecturas van en paralelo: son colecciones independientes y la
  // plataforma las tolera sin límite (verificado). Antes eran secuenciales y
  // cada carga tardaba ~2 s.
  const jobs = [];
  jobs.push((async () => {
    for (const parent of await S.QuestlyParent.list("-created_date", 10)) {
      if (!state.parent) {
        state.parent = toDomain(parent);
        ids.parent = parent.id;
      }
    }
  })());
  for (const cfg of COLLECTIONS) {
    jobs.push((async () => {
      state[cfg.key] = [];
      ids[cfg.key] = {};
      const recs = await S[cfg.entity].list("-created_date", cfg.limit);
      for (const r of recs) {
        state[cfg.key].push(toDomain(r));
        ids[cfg.key][r.ref] = r.id;
      }
    })());
  }
  jobs.push((async () => {
    for (const r of await S.QuestlyStreakProgress.list("-created_date", 10000)) {
      state.streak_progress[r.ref] = {
        count: r.count, rounds: r.rounds, completed: !!r.completed,
        last_day: r.last_day || null, awarded_at: r.awarded_at || null,
        celebrated: r.celebrated === undefined ? true : !!r.celebrated,
      };
      ids.streak_progress[r.ref] = r.id;
    }
  })());
  jobs.push((async () => {
    for (const r of await S.QuestlySession.list("-created_date", 20000)) {
      state.sessions[r.ref] = { user_id: r.user_id, role: r.role };
      ids.sessions[r.ref] = r.id;
    }
  })());
  await Promise.all(jobs);
  return { state, ids };
}

// ---------------------------------------------------------------------------
// persistencia (diff before → after)
// ---------------------------------------------------------------------------

export async function persistState(base44, before, after, ids) {
  const S = base44.asServiceRole.entities;

  // adulto (registro único)
  const pBefore = JSON.stringify(before.parent ? toEntityComparable(before.parent) : null);
  const pAfter = JSON.stringify(after.parent ? toEntityComparable(after.parent) : null);
  if (pBefore !== pAfter) {
    if (before.parent && after.parent && ids.parent) {
      await S.QuestlyParent.update(ids.parent, toEntity(after.parent));
    } else if (!before.parent && after.parent) {
      const created = await S.QuestlyParent.create(toEntity(after.parent));
      ids.parent = created.id;
    }
  }

  for (const cfg of COLLECTIONS) {
    await syncCollection(S, cfg.entity, before[cfg.key] || [], after[cfg.key] || [], ids[cfg.key]);
  }

  // progreso de rachas (mapa "streakId|kidId" → colección)
  const progToArr = (prog) => Object.entries(prog || {}).map(([k, v]) => ({ id: k, ...v }));
  await syncCollection(S, "QuestlyStreakProgress",
    progToArr(before.streak_progress), progToArr(after.streak_progress), ids.streak_progress);

  // sesiones (mapa token → colección)
  const sessToArr = (sess) => Object.entries(sess || {}).map(([t, v]) => ({ id: t, user_id: v.user_id, role: v.role }));
  await syncCollection(S, "QuestlySession",
    sessToArr(before.sessions), sessToArr(after.sessions), ids.sessions);
}

async function syncCollection(S, entity, beforeArr, afterArr, idsMap) {
  const beforeMap = new Map(beforeArr.map((r) => [r.id, JSON.stringify(toEntityComparable(r))]));
  const afterMap = new Map(afterArr.map((r) => [r.id, r]));
  for (const [ref, beforeJson] of beforeMap) {
    if (!afterMap.has(ref)) {
      const entityId = idsMap[ref];
      if (entityId) await S[entity].delete(entityId);
    }
  }
  for (const [ref, rec] of afterMap) {
    const afterJson = JSON.stringify(toEntityComparable(rec));
    if (beforeMap.has(ref)) {
      if (beforeMap.get(ref) !== afterJson) {
        const entityId = idsMap[ref];
        if (entityId) await S[entity].update(entityId, toEntity(rec));
      }
    } else {
      const created = await S[entity].create(toEntity(rec));
      idsMap[ref] = created.id;
    }
  }
}

// ---------------------------------------------------------------------------
// migración de datos antiguos (snapshot de localStorage)
// ---------------------------------------------------------------------------

export function migrateSnapshot(state, fromLegacy) {
  if (!state.streaks) state.streaks = [];
  if (!state.streak_progress) state.streak_progress = {};
  if (!state.backups) state.backups = [];
  if (!state.pin_requests) state.pin_requests = [];
  if (!state.assignments) {
    state.assignments = [];
    buildOnceAssignments(state);
  }
  (state.kids || []).forEach((k) => { if (k.pin === undefined) k.pin = null; });
  (state.quests || []).forEach((q) => { if (!q.created_date) q.created_date = yesterdayStr(); });
  if (fromLegacy) {
    (state.kids || []).forEach((k) => {
      if (k.id === "k1" && k.pin === "1234") k.pin = null;
      if (k.id === "k2" && k.pin === "5678") k.pin = null;
    });
  }
  pruneBackups(state);
}

async function hashSnapshotSecrets(state) {
  if (state.parent && state.parent.password) {
    state.parent.password = await sha256Hex(state.parent.password);
  }
  for (const k of state.kids || []) {
    if (k.pin) k.pin = await sha256Hex(k.pin);
  }
  state.sessions = {};
}

// Importa el snapshot completo de localStorage a la base de datos (solo si el
// servidor está vacío). Devuelve conteos para verificar que todo llegó.
export async function importSnapshot(base44, body) {
  const { state: existing } = await loadState(base44);
  if (existing.parent) {
    throw new ApiError("El servidor ya tiene una familia configurada; no se puede importar encima.");
  }
  const snap = body.snapshot;
  if (!snap || !Array.isArray(snap.kids) || !Array.isArray(snap.quests)) {
    throw new ApiError("Los datos locales no son válidos.");
  }
  migrateSnapshot(snap, !!body.legacy);
  await hashSnapshotSecrets(snap);
  const counts = {
    kids: (snap.kids || []).length,
    quests: (snap.quests || []).length,
    rewards: (snap.rewards || []).length,
    streaks: (snap.streaks || []).length,
    assignments: (snap.assignments || []).length,
    claims: (snap.claims || []).length,
    misses: (snap.misses || []).length,
    steps: (snap.steps || []).length,
    txns: (snap.txns || []).length,
    redemptions: (snap.redemptions || []).length,
    pin_requests: (snap.pin_requests || []).length,
    backups: (snap.backups || []).length,
    streak_progress: Object.keys(snap.streak_progress || {}).length,
    has_parent: !!snap.parent,
  };
  const S = base44.asServiceRole.entities;
  if (snap.parent) await S.QuestlyParent.create(toEntity(snap.parent));
  for (const cfg of COLLECTIONS) {
    for (const rec of snap[cfg.key] || []) {
      await S[cfg.entity].create(toEntity(rec));
    }
  }
  for (const [k, v] of Object.entries(snap.streak_progress || {})) {
    await S.QuestlyStreakProgress.create(toEntity({ id: k, ...v }));
  }
  return {
    message: "Datos migrados al servidor: " + counts.kids + " niños, " + counts.quests +
      " quests, " + counts.txns + " movimientos del historial.",
    counts,
  };
}