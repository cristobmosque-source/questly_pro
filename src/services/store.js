// ALMACÉN DE DATOS DE QUESTLY — única fuente de datos de la aplicación.
// Implementa las reglas de negocio de questly/app: instancias por fecha
// (AYER/HOY) para quests diarias y custom_days, aprobación de claims
// (✅ 100% · 🟡 25% · ❌ -50% · 🚫 No aplica 0 puntos), retractación,
// "marcar como hecha" por el adulto (con origen niño/adulto), instancias
// pasadas que se mantienen abiertas hasta que el adulto las resuelve (sin
// penalización automática), stock de recompensas, metas de ahorro, rachas,
// backups del reinicio de progreso y el flujo de PIN de los niños.
// Zona horaria: America/Santiago.

import { ApiError } from "@/services/error";
import { getToken } from "@/services/session";

const KEY = "questly_store_v3";
const LEGACY_KEY = "questly_demo_v2";
const DELAY_MS = 90; // latencia simulada para que se vean los estados de carga
const TZ = "America/Santiago";

// Copias de seguridad del reinicio: se conservan 30 días exactos.
const BACKUP_VERSION = 1;
const BACKUP_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// estado y persistencia
// ---------------------------------------------------------------------------

function seedState() {
  return {
    seq: 100,
    parent: { id: "p1", name: "Papá / CMB", avatar: "👨", password: "admin" },
    // Los niños parten SIN PIN: cada uno crea el suyo desde su perfil.
    kids: [
      { id: "k1", name: "Samuel", avatar: "🐼", color: "#2563eb", pin: null, points: 8500, lifetime_points: 8500, goal_id: null },
      { id: "k2", name: "Lorenza", avatar: "🦄", color: "#d946ef", pin: null, points: 6250, lifetime_points: 6750, goal_id: null },
    ],
    quests: [
      { id: "q1", title: "Hacer la cama", emoji: "🛏️", description: "", points: 500, repeat: "daily", repeat_days: [], times_per_period: 1, assigned_to: ["k1", "k2"], subtasks: [], active: true },
      { id: "q2", title: "Ordenar habitación", emoji: "🧹", description: "", points: 1000, repeat: "custom_days", repeat_days: [0, 1, 2, 3, 4], times_per_period: 1, assigned_to: ["k1", "k2"], subtasks: [], active: true },
      { id: "q3", title: "Sacar la basura", emoji: "🗑️", description: "", points: 750, repeat: "custom_days", repeat_days: [1, 3], times_per_period: 1, assigned_to: ["k2"], subtasks: [], active: true },
      { id: "q4", title: "Ordenar el clóset", emoji: "🧺", description: "Toda la ropa en su lugar", points: 3000, repeat: "once", repeat_days: [], times_per_period: 1, assigned_to: ["k1"], subtasks: [], active: true, due_date: "2026-10-03" },
      { id: "q5", title: "Limpiar el patio", emoji: "🌿", description: "", points: 2000, repeat: "custom_days", repeat_days: [5], times_per_period: 1, assigned_to: ["k1", "k2"], subtasks: [], active: true },
      { id: "q6", title: "Hacer ejercicio", emoji: "🏃", description: "15 minutos mínimo", points: 800, repeat: "custom_days", repeat_days: [0, 2, 4], times_per_period: 1, assigned_to: ["k1"], subtasks: [], active: true },
    ],
    rewards: [
      { id: "r1", title: "Helado", emoji: "🍦", cost: 500, description: "El sabor que quieras", stock_mode: "unlimited", stock: 0, stock_limit: 1, stock_period: "daily", stock_scope: "child", active: true },
      { id: "r2", title: "Jugar videojuegos", emoji: "🎮", cost: 1000, description: "Una hora extra", stock_mode: "unlimited", stock: 0, stock_limit: 1, stock_period: "daily", stock_scope: "child", active: true },
      { id: "r3", title: "Elegir película", emoji: "🎬", cost: 1500, description: "La película familiar la eliges tú", stock_mode: "unlimited", stock: 0, stock_limit: 1, stock_period: "daily", stock_scope: "child", active: true },
      { id: "r4", title: "Salida al cine", emoji: "🎟️", cost: 10000, description: "Una entrada con palomitas", stock_mode: "unlimited", stock: 0, stock_limit: 1, stock_period: "daily", stock_scope: "child", active: true },
    ],
    // definiciones de rachas (el progreso vive en streak_progress, por niño)
    streaks: [
      { id: "s1", name: "Racha de la cama", quest_id: "q1", kid_id: null, type: "days", target: 7, reward_points: 500, repeatable: true, active: true },
      { id: "s2", name: "Basura puntual", quest_id: "q3", kid_id: "k2", type: "times", target: 4, reward_points: 750, repeatable: false, active: true },
    ],
    streak_progress: {}, // "streakId|kidId" -> {count, rounds, completed, last_day, awarded_at, celebrated}
    pin_requests: [],    // {id, kid_id, status: pending|approved|rejected, at, decided_at}
    backups: [],         // copias creadas automáticamente antes de un reinicio
    // instancias por fecha (d:YYYY-MM-DD); semanal/mensual/once usan su propio bucket
    claims: [
      { id: "c1", quest_id: "q1", kid_id: "k1", period: "d:2026-09-24", date: "2026-09-24", status: "approved", completed_by: "kid", at: "2026-09-24T19:30:00.000Z", decided_at: "2026-09-24T19:35:00.000Z" },
      { id: "c2", quest_id: "q1", kid_id: "k1", period: "d:2026-09-25", date: "2026-09-25", status: "approved", completed_by: "kid", at: "2026-09-25T08:10:00.000Z", decided_at: "2026-09-25T08:20:00.000Z" },
      { id: "c3", quest_id: "q2", kid_id: "k1", period: "d:2026-09-25", date: "2026-09-25", status: "approved", completed_by: "kid", at: "2026-09-25T09:00:00.000Z", decided_at: "2026-09-25T09:10:00.000Z" },
      { id: "c4", quest_id: "q1", kid_id: "k2", period: "d:2026-09-25", date: "2026-09-25", status: "approved", completed_by: "kid", at: "2026-09-25T08:05:00.000Z", decided_at: "2026-09-25T08:15:00.000Z" },
      { id: "c5", quest_id: "q3", kid_id: "k2", period: "d:2026-09-24", date: "2026-09-24", status: "approved", completed_by: "kid", at: "2026-09-24T18:45:00.000Z", decided_at: "2026-09-24T18:50:00.000Z" },
      { id: "c6", quest_id: "q6", kid_id: "k1", period: "d:2026-09-23", date: "2026-09-23", status: "not_applicable", decision: "not_applicable", completed_by: "parent", comment: "Estuvo de viaje con la abuela", at: "2026-09-23T21:00:00.000Z", decided_at: "2026-09-23T21:05:00.000Z" },
    ],
    // una penalización por instancia (quest_id + kid_id + period)
    misses: [
      { id: "m1", quest_id: "q2", kid_id: "k2", period: "d:2026-09-25", penalty: 500, at: "2026-09-25T09:15:00.000Z" },
    ],
    steps: [],         // {quest_id, kid_id, period, subtask_id}
    txns: [
      { id: "t1", kid_id: "k1", delta: 6500, reason: "Puntos de bienvenida", kind: "award", at: "2026-09-20T10:00:00.000Z", actor: "Papá / CMB", balance_after: 6500 },
      { id: "t5", kid_id: "k2", delta: 5500, reason: "Puntos de bienvenida", kind: "award", at: "2026-09-20T10:05:00.000Z", actor: "Papá / CMB", balance_after: 5500 },
      { id: "t6", kid_id: "k2", delta: 750, reason: "Sacar la basura", kind: "quest", at: "2026-09-24T18:50:00.000Z", actor: "Papá / CMB", balance_after: 6250, origin: "kid", origin_name: "Lorenza" },
      { id: "t2", kid_id: "k1", delta: 500, reason: "Hacer la cama", kind: "quest", at: "2026-09-24T19:35:00.000Z", actor: "Papá / CMB", balance_after: 7000, origin: "kid", origin_name: "Samuel" },
      { id: "t4", kid_id: "k2", delta: 500, reason: "Hacer la cama", kind: "quest", at: "2026-09-25T08:15:00.000Z", actor: "Papá / CMB", balance_after: 6750, origin: "kid", origin_name: "Lorenza" },
      { id: "t3", kid_id: "k1", delta: 500, reason: "Hacer la cama", kind: "quest", at: "2026-09-25T08:20:00.000Z", actor: "Papá / CMB", balance_after: 7500, origin: "kid", origin_name: "Samuel" },
      { id: "t8", kid_id: "k2", delta: -500, reason: "'Ordenar habitación' no realizada (vie 25 sept)", kind: "missed", at: "2026-09-25T09:15:00.000Z", actor: "Papá / CMB", balance_after: 6250, origin: "parent", origin_name: "Papá / CMB" },
      { id: "t7", kid_id: "k1", delta: 1000, reason: "Ordenar habitación", kind: "quest", at: "2026-09-25T09:10:00.000Z", actor: "Papá / CMB", balance_after: 8500, origin: "kid", origin_name: "Samuel" },
    ],
    redemptions: [],  // {id, reward_id, kid_id, title, emoji, cost, status, at, decided_at}
    sessions: {},     // token -> {user_id, role}
  };
}

let cache = null;

// Migraciones: mantiene funcionando datos guardados por versiones anteriores
// y limpia las colecciones nuevas que falten.
function migrate(state, fromLegacy) {
  if (!state.streaks) state.streaks = [];
  if (!state.streak_progress) state.streak_progress = {};
  if (!state.backups) state.backups = [];
  if (!state.pin_requests) state.pin_requests = [];
  state.kids.forEach((k) => { if (k.pin === undefined) k.pin = null; });
  if (fromLegacy) {
    // Los PIN 1234/5678 venían del entorno de pruebas: los niños parten sin
    // PIN y crean el suyo desde su perfil.
    state.kids.forEach((k) => {
      if (k.id === "k1" && k.pin === "1234") k.pin = null;
      if (k.id === "k2" && k.pin === "5678") k.pin = null;
    });
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* nada */ }
  }
  pruneBackups(state);
}

function load() {
  if (cache) return cache;
  let parsed = null;
  let fromLegacy = false;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      parsed = JSON.parse(raw);
    } else {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) { parsed = JSON.parse(legacy); fromLegacy = true; }
    }
  } catch {
    parsed = null;
  }
  cache = parsed && parsed.txns ? parsed : seedState();
  migrate(cache, fromLegacy);
  save(cache);
  return cache;
}

function save(state) {
  cache = state;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* sin espacio: seguimos en memoria */ }
}

// Solo para pruebas internas: borra el almacén y vuelve al estado inicial.
export function resetStore() {
  cache = null;
  try { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY_KEY); } catch { /* nada */ }
}

// Solo para pruebas internas: modifica el almacén en crudo.
export function _mutateStore(mut) {
  const state = load();
  mut(state);
  save(state);
}

// ---------------------------------------------------------------------------
// helpers de tiempo — todo en la zona horaria America/Santiago
// ---------------------------------------------------------------------------

const nowISO = () => new Date().toISOString();
const round1 = (n) => Math.round(Number(n) * 10) / 10;

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
});

// fecha local (Santiago) en formato YYYY-MM-DD
const ymd = (d = new Date()) => dateFmt.format(d);

function addDaysStr(dateStr, n) {
  return ymd(new Date(Date.parse(dateStr + "T12:00:00Z") + n * 86400000));
}

const todayStr = () => ymd(new Date());
const yesterdayStr = () => addDaysStr(todayStr(), -1);

// 0 = lunes … 6 = domingo (convención de Questly)
const questlyWeekday = (dateStr) => (new Date(dateStr + "T12:00:00Z").getUTCDay() + 6) % 7;

const mondayStr = (dateStr) => addDaysStr(dateStr, -questlyWeekday(dateStr));

function periodFor(quest, dateStr) {
  switch (quest.repeat) {
    case "daily":
    case "custom_days":
      return "d:" + dateStr;
    case "weekly":
      return "w:" + mondayStr(dateStr);
    case "monthly":
      return "m:" + dateStr.slice(0, 7);
    default:
      return "once";
  }
}

// ¿la quest tiene una instancia concreta para cada fecha en que toca?
const isDateInstance = (quest) => quest.repeat === "daily" || quest.repeat === "custom_days";

function dueOn(quest, dateStr) {
  if (!quest.active) return false;
  if (quest.repeat === "custom_days") return (quest.repeat_days || []).includes(questlyWeekday(dateStr));
  if (quest.repeat === "once") return !quest.completed_once;
  return true; // daily, weekly, monthly
}

const assignedTo = (quest, kidId) =>
  !quest.assigned_to || !quest.assigned_to.length || quest.assigned_to.includes(kidId);

const periodLabel = (repeat) =>
  repeat === "weekly" ? "esta semana" : repeat === "monthly" ? "este mes" : "hoy";

function dateLabel(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// helpers de dominio
// ---------------------------------------------------------------------------

// Nunca expone el PIN: solo si existe.
function pubKid(k) {
  return { id: k.id, name: k.name, avatar: k.avatar, color: k.color, points: k.points, lifetime_points: k.lifetime_points, has_pin: !!k.pin };
}

function newId(state) {
  state.seq += 1;
  return "e" + state.seq;
}

function addTxn(state, kid, delta, reason, kind, actor = null) {
  kid.points = round1(kid.points + delta);
  if (delta > 0) kid.lifetime_points = round1(kid.lifetime_points + delta);
  const t = { id: newId(state), kid_id: kid.id, delta: round1(delta), reason, kind, at: nowISO(), actor, balance_after: kid.points };
  state.txns.push(t);
  return t;
}

const kidTxns = (state, kidId) =>
  state.txns.filter((t) => t.kid_id === kidId).sort((a, b) => (a.at < b.at ? 1 : -1));

// Estado de la INSTANCIA de una quest en una fecha concreta:
// open | pending | done | rejected | missed
function instanceState(state, quest, kidId, dateStr) {
  const period = periodFor(quest, dateStr);
  const claims = state.claims.filter((c) => c.quest_id === quest.id && c.kid_id === kidId && c.period === period);
  if (claims.some((c) => c.status === "pending")) return "pending";
  if (claims.some((c) => c.status === "not_applicable")) return "not_applicable";
  const approved = claims.filter((c) => c.status === "approved").length;
  if (approved >= quest.times_per_period) return "done";
  if (state.misses.some((m) => m.quest_id === quest.id && m.kid_id === kidId && m.period === period)) return "missed";
  if (claims.some((c) => c.status === "rejected")) return "rejected";
  // cierre del día: si la instancia era hoy y ya pasó, venció
  if (isDateInstance(quest) && dateStr < todayStr()) return "missed";
  return "open";
}

const penaltyApplied = (state, quest, kidId, dateStr) =>
  state.misses.some((m) => m.quest_id === quest.id && m.kid_id === kidId && m.period === periodFor(quest, dateStr));

function questForKid(state, quest, kid, dateStr) {
  const period = periodFor(quest, dateStr);
  const claims = state.claims.filter((c) => c.quest_id === quest.id && c.kid_id === kid.id && c.period === period);
  const subtasks = quest.subtasks.map((s) => ({
    id: s.id,
    text: s.text,
    done: state.steps.some((t) => t.quest_id === quest.id && t.kid_id === kid.id && t.period === period && t.subtask_id === s.id),
  }));
  const stepsDone = subtasks.filter((s) => s.done).length;
  return {
    id: quest.id, title: quest.title, emoji: quest.emoji, description: quest.description,
    points: quest.points, repeat: quest.repeat, repeat_days: quest.repeat_days || [],
    limit: quest.times_per_period, used: claims.filter((c) => c.status !== "rejected").length,
    subtasks, steps_total: subtasks.length, steps_done: stepsDone,
    state: instanceState(state, quest, kid.id, dateStr),
    penalty: round1(quest.points / 2), due_date: quest.due_date || null,
  };
}

function kidQuests(state, kid, dateStr) {
  return state.quests
    .filter((q) => assignedTo(q, kid.id) && dueOn(q, dateStr))
    .map((q) => questForKid(state, q, kid, dateStr));
}

// Resumen de las instancias de AYER de un niño (solo quests por fecha)
function dayItems(state, kid, dateStr) {
  return state.quests
    .filter((q) => isDateInstance(q) && assignedTo(q, kid.id) && dueOn(q, dateStr))
    .map((q) => {
      const period = periodFor(q, dateStr);
      const na = state.claims.find((c) =>
        c.quest_id === q.id && c.kid_id === kid.id && c.period === period && c.status === "not_applicable");
      return {
        id: q.id, title: q.title, emoji: q.emoji, points: q.points,
        penalty: round1(q.points / 2),
        state: instanceState(state, q, kid.id, dateStr),
        penalty_applied: penaltyApplied(state, q, kid.id, dateStr),
        comment: na ? na.comment || null : null,
      };
    });
}

function daySummary(state, kid, dateStr, onlyDateInstances) {
  const items = onlyDateInstances ? dayItems(state, kid, dateStr) : kidQuests(state, kid, dateStr);
  const count = (s) => items.filter((i) => i.state === s).length;
  return {
    done: count("done"), pending: count("pending"), rejected: count("rejected"),
    missed: count("missed"), not_applicable: count("not_applicable"), open: count("open"),
  };
}

function stockText(r) {
  if (r.stock_mode === "fixed") return "Quedan " + r.stock;
  if (r.stock_mode === "periodic") {
    const per = { daily: "al día", weekly: "a la semana", monthly: "al mes" }[r.stock_period] || "";
    return `${r.stock_limit} ${per} ${r.stock_scope === "child" ? "por niño" : "en familia"}`;
  }
  return "";
}

function pubReward(r) {
  return {
    id: r.id, title: r.title, emoji: r.emoji, cost: r.cost, description: r.description,
    stock_text: stockText(r), sold_out: r.stock_mode === "fixed" && r.stock <= 0,
  };
}

function goalFor(state, kid) {
  const rewards = state.rewards.filter((r) => r.active);
  let goal = null, chosen = false;
  if (kid.goal_id) {
    const r = rewards.find((x) => x.id === kid.goal_id);
    if (r) { goal = r; chosen = true; }
  }
  if (!goal) {
    const next = rewards.filter((r) => r.cost > kid.points).sort((a, b) => a.cost - b.cost)[0];
    if (next) goal = next;
  }
  return {
    goal: goal ? { id: goal.id, title: goal.title, emoji: goal.emoji, cost: goal.cost } : null,
    chosen, reached: !!(goal && kid.points >= goal.cost),
  };
}

function claimsPending(state) {
  return state.claims
    .filter((c) => c.status === "pending")
    .map((c) => {
      const quest = state.quests.find((q) => q.id === c.quest_id);
      const kid = state.kids.find((k) => k.id === c.kid_id);
      return { id: c.id, kid_name: kid ? kid.name : "—", title: quest ? quest.title : "Quest", emoji: quest ? quest.emoji : "⭐", points: quest ? quest.points : 0, at: c.at };
    })
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

function redemptionsPending(state) {
  return state.redemptions
    .filter((r) => r.status === "pending")
    .map((r) => ({ id: r.id, kid_name: (state.kids.find((k) => k.id === r.kid_id) || {}).name || "—", title: r.title, emoji: r.emoji, cost: r.cost, at: r.at }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

function todayRows(state, dateStr) {
  return state.kids.map((kid) => ({ kid: pubKid(kid), quests: kidQuests(state, kid, dateStr) }));
}

function yesterdayRows(state, dateStr) {
  return state.kids.map((kid) => ({ kid: pubKid(kid), items: dayItems(state, kid, dateStr) }));
}

// ---------------------------------------------------------------------------
// rachas — objetivos ligados a una quest, con progreso propio por niño
//
//   "days"  → N días cumplidos (un día a medias no cuenta ni rompe; una
//             instancia no realizada rompe la racha)
//   "times" → N completaciones aprobadas, en cualquier orden/fecha
//
// Solo la decisión del adulto mueve el progreso: mientras el claim está
// pendiente (o se retracta) no cuenta; una posterior aprobación al 100% sí.
// ---------------------------------------------------------------------------

const progKey = (streakId, kidId) => streakId + "|" + kidId;

function getProg(state, s, kidId) {
  const k = progKey(s.id, kidId);
  if (!state.streak_progress[k]) {
    state.streak_progress[k] = { count: 0, rounds: 0, completed: false, last_day: null, awarded_at: null, celebrated: true };
  }
  return state.streak_progress[k];
}

const streakAppliesTo = (s, kidId) => s.kid_id === null || s.kid_id === kidId;

function applyStreaksOnDecision(state, kid, quest, decision, claim) {
  const awards = [];
  if (!quest) return awards;
  const dayKey = (claim && (claim.date || claim.period)) || null;
  for (const s of state.streaks) {
    if (!s.active || s.quest_id !== quest.id || !streakAppliesTo(s, kid.id)) continue;
    const prog = getProg(state, s, kid.id);
    if (prog.completed) continue;
    if (decision === "approve") {
      // un mismo día no suma dos veces en una racha de días
      if (s.type === "days") {
        if (prog.last_day === dayKey) continue;
        prog.last_day = dayKey;
      }
      prog.count += 1;
      if (prog.count >= s.target) {
        addTxn(state, kid, s.reward_points, "Racha completada: " + s.name, "streak", null);
        prog.rounds += 1;
        prog.awarded_at = nowISO();
        prog.celebrated = false; // el niño la celebrará en su inicio
        prog.count = 0;
        if (!s.repeatable) prog.completed = true;
        awards.push(s);
      }
    } else if (decision === "not_done" && s.type === "days") {
      // dijo que la hizo y no fue así: la racha de días vuelve a 0
      prog.count = 0;
      prog.last_day = dayKey;
    }
    // "partial": no cuenta como cumplida, pero tampoco rompe.
  }
  return awards;
}

// Una instancia marcada como no realizada (vencida o por el adulto) rompe
// las rachas de días consecutivos de esa quest.
function breakDayStreaks(state, kid, quest) {
  for (const s of state.streaks) {
    if (!s.active || s.quest_id !== quest.id || s.type !== "days") continue;
    if (!streakAppliesTo(s, kid.id)) continue;
    const prog = getProg(state, s, kid.id);
    if (!prog.completed) { prog.count = 0; prog.last_day = null; }
  }
}

function streaksForKid(state, kid) {
  return state.streaks
    .filter((s) => s.active && streakAppliesTo(s, kid.id))
    .map((s) => {
      const prog = getProg(state, s, kid.id);
      const quest = state.quests.find((q) => q.id === s.quest_id);
      return {
        id: s.id, name: s.name, emoji: s.type === "days" ? "🔥" : "⭐",
        quest_title: quest ? quest.title : "—", quest_active: !!quest && !!quest.active,
        type: s.type, target: s.target, count: prog.count,
        remaining: Math.max(0, s.target - prog.count),
        reward_points: s.reward_points, repeatable: !!s.repeatable,
        completed: !!prog.completed, rounds: prog.rounds,
      };
    });
}

// Celebraciones pendientes para el niño (se marcan vistas al entregarlas).
function collectCelebrations(state, kid) {
  const out = [];
  for (const s of state.streaks) {
    if (!streakAppliesTo(s, kid.id)) continue;
    const prog = state.streak_progress[progKey(s.id, kid.id)];
    if (prog && prog.awarded_at && !prog.celebrated) {
      prog.celebrated = true;
      out.push({ name: s.name, reward_points: s.reward_points, emoji: s.type === "days" ? "🔥" : "⭐" });
    }
  }
  return out;
}

function pubStreak(state, s) {
  const quest = state.quests.find((q) => q.id === s.quest_id);
  const kid = s.kid_id ? state.kids.find((k) => k.id === s.kid_id) : null;
  return {
    id: s.id, name: s.name, quest_id: s.quest_id,
    quest_title: quest ? quest.title : "—", quest_emoji: quest ? quest.emoji : "⭐",
    quest_active: !!quest && !!quest.active,
    kid_id: s.kid_id, kid_name: kid ? kid.name : null,
    type: s.type, target: s.target, reward_points: s.reward_points,
    repeatable: !!s.repeatable, active: !!s.active,
    progress: state.kids.map((k) => {
      const prog = getProg(state, s, k.id);
      return { kid_id: k.id, kid_name: k.name, count: prog.count, rounds: prog.rounds, completed: !!prog.completed };
    }),
  };
}

function validateStreak(state, body) {
  const name = String(body.name || "").trim();
  if (!name) throw new ApiError("Ponle un nombre a la racha.");
  const quest = state.quests.find((q) => q.id === body.quest_id);
  if (!quest) throw new ApiError("Elige la quest de la racha.");
  const type = body.type === "times" ? "times" : "days";
  const target = Number(body.target);
  if (!Number.isFinite(target) || target < 1 || target > 365)
    throw new ApiError("La cantidad debe estar entre 1 y 365.");
  const reward_points = Number(body.reward_points);
  if (!Number.isFinite(reward_points) || reward_points < 1 || reward_points > 100000)
    throw new ApiError("La recompensa debe estar entre 1 y 100000 puntos.");
  const kid_id = body.kid_id && state.kids.some((k) => k.id === body.kid_id) ? body.kid_id : null;
  return {
    name: name.slice(0, 60), quest_id: quest.id, type, target,
    reward_points, kid_id, repeatable: !!body.repeatable,
  };
}

// Borra una racha y todo el progreso asociado.
function removeStreak(state, streak) {
  state.streaks = state.streaks.filter((s) => s.id !== streak.id);
  Object.keys(state.streak_progress).forEach((k) => {
    if (k.startsWith(streak.id + "|")) delete state.streak_progress[k];
  });
}

// ---------------------------------------------------------------------------
// copias de seguridad del reinicio de progreso (vigencia: 30 días)
// ---------------------------------------------------------------------------

function pruneBackups(state) {
  if (!state.backups || !state.backups.length) return;
  const cutoff = Date.now() - BACKUP_TTL_MS;
  state.backups = state.backups.filter((b) => {
    const t = new Date(b.created_at).getTime();
    return Number.isFinite(t) && t > cutoff;
  });
}

function snapshotProgress(state) {
  return {
    kids: state.kids.map((k) => ({ id: k.id, points: k.points, lifetime_points: k.lifetime_points, goal_id: k.goal_id })),
    txns: state.txns.slice(),
    claims: state.claims.slice(),
    misses: state.misses.slice(),
    steps: state.steps.slice(),
    redemptions: state.redemptions.slice(),
    streak_progress: JSON.parse(JSON.stringify(state.streak_progress || {})),
  };
}

function createBackup(state) {
  pruneBackups(state);
  const b = {
    id: newId(state),
    name: "Backup antes de reinicio",
    created_at: nowISO(),
    version: BACKUP_VERSION,
    data: snapshotProgress(state),
  };
  state.backups.push(b);
  return b;
}

function listBackups(state) {
  pruneBackups(state);
  return state.backups
    .slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((b) => ({
      id: b.id, name: b.name, created_at: b.created_at, version: b.version,
      kids: b.data.kids.map((k) => {
        const kid = state.kids.find((x) => x.id === k.id);
        return { id: k.id, name: kid ? kid.name : k.id, points: k.points };
      }),
      txn_count: b.data.txns.length,
      claim_count: b.data.claims.length,
      redemption_count: b.data.redemptions.length,
      expires_at: new Date(new Date(b.created_at).getTime() + BACKUP_TTL_MS).toISOString(),
    }));
}

// Reinicia SOLO el progreso/gamificación. Usuarios, quests, recompensas y
// definiciones de rachas se conservan; antes de borrar se crea un backup.
function resetProgress(state) {
  const b = createBackup(state);
  state.txns = [];
  state.claims = [];
  state.misses = [];
  state.steps = [];
  state.redemptions = [];
  state.streak_progress = {};
  state.kids.forEach((k) => { k.points = 0; k.lifetime_points = 0; k.goal_id = null; });
  state.quests.forEach((q) => { if (q.repeat === "once") q.completed_once = false; });
  return {
    message: "Progreso reiniciado: todos parten de 0. Se creó la copia de seguridad " +
      new Date(b.created_at).toLocaleString("es-CL") + ".",
    backups: listBackups(state),
  };
}

function restoreBackup(state, id) {
  const b = state.backups.find((x) => x.id === id);
  if (!b) throw new ApiError("Esa copia de seguridad ya no existe.", { status: 404 });
  const d = b.data;
  state.txns = d.txns.slice();
  state.claims = d.claims.slice();
  state.misses = d.misses.slice();
  state.steps = d.steps.slice();
  state.redemptions = d.redemptions.slice();
  state.streak_progress = JSON.parse(JSON.stringify(d.streak_progress || {}));
  d.kids.forEach((bk) => {
    const k = state.kids.find((x) => x.id === bk.id);
    if (k) { k.points = bk.points; k.lifetime_points = bk.lifetime_points; k.goal_id = bk.goal_id; }
  });
  return { message: "Copia restaurada: puntos, historial y rachas volvieron a como estaban antes del reinicio." };
}

// ---------------------------------------------------------------------------
// sesión
// ---------------------------------------------------------------------------

function current(state) {
  const token = getToken();
  const s = state.sessions[token];
  if (!s) throw new ApiError("Tu sesión expiró. Entra de nuevo.", { status: 401 });
  return s;
}

function requireKid(state) {
  const s = current(state);
  if (s.role !== "kid") throw new ApiError("Esta sección es solo para niños.", { status: 403 });
  const kid = state.kids.find((k) => k.id === s.user_id);
  if (!kid) throw new ApiError("Tu perfil ya no existe.", { status: 401 });
  return kid;
}

function requireParent(state) {
  const s = current(state);
  if (s.role !== "parent") throw new ApiError("Esta sección es solo para adultos.", { status: 403 });
  return state.parent;
}

function login(state, user_id, role) {
  const token = role + "-" + user_id + "-" + Math.random().toString(36).slice(2, 8);
  state.sessions[token] = { user_id, role };
  return token;
}

// ---------------------------------------------------------------------------
// validaciones de quests y recompensas
// ---------------------------------------------------------------------------

const REPEATS = ["daily", "weekly", "once", "custom_days", "monthly"];

function normalizeSubtasks(raw) {
  const lines = Array.isArray(raw) ? raw : String(raw || "").split("\n");
  return lines.map((l) => l.trim()).filter(Boolean).slice(0, 12)
    .map((text, i) => ({ id: "st" + i, text }));
}

function validateQuest(state, body) {
  const title = String(body.title || "").trim();
  if (!title) throw new ApiError("Ponle un título a la quest.");
  const points = Number(body.points);
  if (!Number.isFinite(points) || points < 1 || points > 100000)
    throw new ApiError("Los puntos deben estar entre 1 y 100000 (1000 puntos = $1.000).");
  const repeat = REPEATS.includes(body.repeat) ? body.repeat : "daily";
  let repeat_days = Array.isArray(body.repeat_days) ? body.repeat_days.filter((x) => x >= 0 && x <= 6) : [];
  if (repeat === "custom_days" && !repeat_days.length)
    throw new ApiError("Elige al menos un día para esta quest.");
  const times_per_period = Math.min(20, Math.max(1, Number(body.times_per_period) || 1));
  const assigned_to = (Array.isArray(body.assigned_to) ? body.assigned_to : [])
    .filter((id) => state.kids.some((k) => k.id === id));
  return {
    title: title.slice(0, 80),
    emoji: String(body.emoji || "").slice(0, 4),
    description: String(body.description || "").slice(0, 240),
    points, repeat, repeat_days: repeat === "custom_days" ? repeat_days.sort() : [],
    times_per_period, assigned_to,
    subtasks: normalizeSubtasks(body.subtasks),
    due_date: repeat === "once" && body.due_date ? String(body.due_date).slice(0, 10) : null,
  };
}

function validateReward(body) {
  const title = String(body.title || "").trim();
  if (!title) throw new ApiError("Ponle un nombre a la recompensa.");
  const cost = Number(body.cost);
  if (!Number.isFinite(cost) || cost < 1 || cost > 100000)
    throw new ApiError("El costo debe estar entre 1 y 100000 puntos (1000 puntos = $1.000).");
  const stock_mode = ["unlimited", "fixed", "periodic"].includes(body.stock_mode) ? body.stock_mode : "unlimited";
  return {
    title: title.slice(0, 80),
    emoji: String(body.emoji || "🎁").slice(0, 4),
    description: String(body.description || "").slice(0, 240),
    cost, stock_mode,
    stock: Math.max(0, Math.min(9999, Number(body.stock) || 0)),
    stock_limit: Math.max(1, Math.min(999, Number(body.stock_limit) || 1)),
    stock_period: ["daily", "weekly", "monthly"].includes(body.stock_period) ? body.stock_period : "daily",
    stock_scope: body.stock_scope === "family" ? "family" : "child",
  };
}

// ---------------------------------------------------------------------------
// dispatcher de rutas
// ---------------------------------------------------------------------------

function handle(state, method, path, body) {
  const tStr = todayStr();
  const yStr = yesterdayStr();
  let m;

  // ----- públicos / auth ---------------------------------------------------

  if (method === "GET" && path === "/bootstrap") {
    return {
      has_parent: !!state.parent,
      parent: state.parent ? { name: state.parent.name, avatar: state.parent.avatar } : null,
      kids: state.kids.map((k) => ({ id: k.id, name: k.name, avatar: k.avatar, color: k.color, has_pin: !!k.pin })),
    };
  }

  if (method === "POST" && path === "/setup")
    throw new ApiError("La familia ya está configurada. Entra con tu contraseña.");

  if (method === "POST" && path === "/auth/kid") {
    const kid = state.kids.find((k) => k.id === body.kid_id);
    if (!kid) throw new ApiError("Ese perfil ya no existe.", { status: 404 });
    // Sin PIN configurado el niño entra directo; con PIN hay que acertarlo.
    if (kid.pin && String(body.pin || "") !== kid.pin) throw new ApiError("PIN incorrecto. Inténtalo otra vez.");
    const token = login(state, kid.id, "kid");
    return { token, user: { id: kid.id, role: "kid", name: kid.name, avatar: kid.avatar, color: kid.color, points: kid.points } };
  }

  if (method === "POST" && path === "/auth/parent") {
    if (String(body.password || "") !== state.parent.password)
      throw new ApiError("Contraseña incorrecta.");
    const token = login(state, state.parent.id, "parent");
    return { token, user: { id: state.parent.id, role: "parent", name: state.parent.name, avatar: state.parent.avatar } };
  }

  if (method === "GET" && path === "/me") {
    const s = current(state);
    if (s.role === "kid") {
      const kid = requireKid(state);
      return { user: { ...pubKid(kid), role: "kid" } };
    }
    return { user: { id: state.parent.id, role: "parent", name: state.parent.name, avatar: state.parent.avatar } };
  }

  // ----- niño --------------------------------------------------------------
  if (method === "GET" && path === "/kid/home") {
    const kid = requireKid(state);
    const g = goalFor(state, kid);
    return {
      kid: pubKid(kid),
      today_date: tStr,
      yesterday_date: yStr,
      quests: kidQuests(state, kid, tStr),
      yesterday: { date: yStr, items: dayItems(state, kid, yStr) },
      streaks: streaksForKid(state, kid),
      celebrations: collectCelebrations(state, kid),
      goal: g.goal, goal_chosen: g.chosen, goal_reached: g.reached,
      affordable: state.rewards.filter((r) => r.active && r.cost <= kid.points).map(pubReward),
      history: kidTxns(state, kid.id).slice(0, 6),
    };
  }

  if (method === "POST" && (m = path.match(/^\/kid\/quests\/([^/]+)\/claim$/))) {
    const kid = requireKid(state);
    const quest = state.quests.find((q) => q.id === m[1]);
    if (!quest || !quest.active) throw new ApiError("Esta quest ya no existe.");
    if (!assignedTo(quest, kid.id)) throw new ApiError("Esta quest no es tuya.");
    if (!dueOn(quest, tStr)) throw new ApiError("Esta quest no toca hoy.");
    const period = periodFor(quest, tStr);
    if (state.misses.some((x) => x.quest_id === quest.id && x.kid_id === kid.id && x.period === period))
      throw new ApiError("Esta quest quedó marcada como no realizada.");
    const claims = state.claims.filter((c) => c.quest_id === quest.id && c.kid_id === kid.id && c.period === period);
    if (claims.some((c) => c.status === "pending"))
      throw new ApiError("Ya está esperando que un adulto la revise.");
    if (claims.some((c) => c.status === "not_applicable"))
      throw new ApiError("Esta quest quedó como no aplica" + (isDateInstance(quest) ? " hoy." : "."));
    if (claims.filter((c) => c.status === "approved").length >= quest.times_per_period)
      throw new ApiError("Ya completaste esta quest " + periodLabel(quest.repeat) + ".");
    const stepsDone = state.steps.filter((t) => t.quest_id === quest.id && t.kid_id === kid.id && t.period === period).length;
    if (quest.subtasks.length && stepsDone < quest.subtasks.length)
      throw new ApiError("Te faltan pasos por marcar antes de decir ¡listo!.");
    state.claims.push({ id: newId(state), quest_id: quest.id, kid_id: kid.id, period, date: isDateInstance(quest) ? tStr : null, status: "pending", completed_by: "kid", at: nowISO() });
    return { kid: pubKid(kid), quests: kidQuests(state, kid, tStr), message: "¡Listo! Ahora queda esperando que un adulto la revise." };
  }

  // Retractación del niño: SOLO mientras la instancia está pendiente de
  // revisión. Vuelve a "por hacer" sin sumar ni restar puntos, sin
  // penalización, sin transacción y sin consumir el cupo del día.
  if (method === "POST" && (m = path.match(/^\/kid\/quests\/([^/]+)\/retract$/))) {
    const kid = requireKid(state);
    const quest = state.quests.find((q) => q.id === m[1]);
    if (!quest) throw new ApiError("Esta quest ya no existe.", { status: 404 });
    const period = periodFor(quest, tStr);
    const idx = state.claims.findIndex((c) =>
      c.quest_id === quest.id && c.kid_id === kid.id && c.period === period && c.status === "pending");
    if (idx === -1)
      throw new ApiError("Solo puedes retractarte mientras está pendiente de revisión.");
    state.claims.splice(idx, 1);
    return {
      kid: pubKid(kid),
      quests: kidQuests(state, kid, tStr),
      message: "Quedó pendiente otra vez: hazla bien y vuelve a marcarla cuando estés listo.",
    };
  }

  if (method === "POST" && (m = path.match(/^\/kid\/quests\/([^/]+)\/step\/([^/]+)$/))) {
    const kid = requireKid(state);
    const quest = state.quests.find((q) => q.id === m[1]);
    if (!quest) throw new ApiError("Esta quest ya no existe.");
    const step = quest.subtasks.find((s) => s.id === m[2]);
    if (!step) throw new ApiError("Ese paso no existe.");
    const period = periodFor(quest, tStr);
    const key = (t) => t.quest_id === quest.id && t.kid_id === kid.id && t.period === period && t.subtask_id === step.id;
    if (state.steps.some(key)) state.steps = state.steps.filter((t) => !key(t));
    else state.steps.push({ quest_id: quest.id, kid_id: kid.id, period, subtask_id: step.id });
    return { ok: true };
  }

  // ----- PIN del niño (crear el suyo / solicitar restablecimiento) ----------

  if (method === "POST" && path === "/kid/pin") {
    const kid = requireKid(state);
    if (kid.pin) throw new ApiError("Ya tienes un PIN. Si lo olvidaste, pide restablecerlo desde aquí.");
    const pin = String(body.pin || "").trim();
    if (!/^\d{4,6}$/.test(pin)) throw new ApiError("El PIN debe tener entre 4 y 6 dígitos.");
    if (pin !== String(body.confirm || "").trim()) throw new ApiError("Los PIN no coinciden. Inténtalo otra vez.");
    kid.pin = pin;
    return { message: "¡PIN creado! La próxima vez lo usarás para entrar." };
  }

  if (method === "POST" && path === "/kid/pin/forgot") {
    const kid = requireKid(state);
    const existing = state.pin_requests.find((r) => r.kid_id === kid.id && r.status === "pending");
    if (existing) return { message: "Ya hay una solicitud en camino. Un adulto la revisará pronto." };
    state.pin_requests.push({ id: newId(state), kid_id: kid.id, status: "pending", at: nowISO() });
    return { message: "Solicitud enviada. Un adulto te ayudará pronto." };
  }

  if (method === "GET" && path === "/kid/profile") {
    const kid = requireKid(state);
    const reqs = state.pin_requests
      .filter((r) => r.kid_id === kid.id)
      .sort((a, b) => (a.at < b.at ? 1 : -1));
    return {
      kid: pubKid(kid),
      pin_request: reqs.length ? { status: reqs[0].status, at: reqs[0].at } : null,
    };
  }

  if (method === "GET" && path === "/kid/shop") {
    const kid = requireKid(state);
    return {
      kid: pubKid(kid),
      rewards: state.rewards.filter((r) => r.active).map(pubReward),
      pending: state.redemptions.filter((r) => r.kid_id === kid.id && r.status === "pending")
        .map((r) => ({ id: r.id, emoji: r.emoji, title: r.title, at: r.at })),
      goal_id: kid.goal_id,
    };
  }

  if (method === "POST" && (m = path.match(/^\/kid\/shop\/([^/]+)\/buy$/))) {
    const kid = requireKid(state);
    const reward = state.rewards.find((r) => r.id === m[1]);
    if (!reward || !reward.active) throw new ApiError("Esta recompensa ya no está disponible.");
    if (reward.stock_mode === "fixed" && reward.stock <= 0) throw new ApiError("Se agotó. ¡Qué popular!");
    if (state.redemptions.some((r) => r.reward_id === reward.id && r.kid_id === kid.id && r.status === "pending"))
      throw new ApiError("Ya la pediste — espera a que te la entreguen.");
    if (kid.points < reward.cost)
      throw new ApiError("Te faltan " + (reward.cost - kid.points) + " puntos para canjearla.");
    if (reward.stock_mode === "periodic") {
      const bucket = (at) => {
        const day = ymd(new Date(at));
        if (reward.stock_period === "daily") return "d:" + day;
        if (reward.stock_period === "weekly") return "w:" + mondayStr(day);
        return "m:" + day.slice(0, 7);
      };
      const nowBucket = bucket(nowISO());
      const used = state.redemptions.filter((r) => {
        if (r.reward_id !== reward.id || (r.status !== "pending" && r.status !== "approved")) return false;
        if (reward.stock_scope === "child" && r.kid_id !== kid.id) return false;
        return bucket(r.at) === nowBucket;
      }).length;
      if (used >= reward.stock_limit) throw new ApiError("Se agotó el cupo " + periodLabel(reward.stock_period === "daily" ? "daily" : reward.stock_period) + ".");
    }
    if (reward.stock_mode === "fixed") reward.stock -= 1;
    addTxn(state, kid, -reward.cost, "Canje: " + reward.title, "redeem");
    state.redemptions.push({ id: newId(state), reward_id: reward.id, kid_id: kid.id, title: reward.title, emoji: reward.emoji, cost: reward.cost, status: "pending", at: nowISO() });
    return { message: "¡Canjeada! Un adulto te la entregará pronto." };
  }

  if (method === "POST" && path === "/kid/goal/clear") {
    const kid = requireKid(state);
    kid.goal_id = null;
    return { message: "Meta quitada." };
  }

  if (method === "POST" && (m = path.match(/^\/kid\/goal\/([^/]+)$/))) {
    const kid = requireKid(state);
    const reward = state.rewards.find((r) => r.id === m[1] && r.active);
    if (!reward) throw new ApiError("Esa recompensa ya no existe.");
    kid.goal_id = reward.id;
    return { message: "¡Nueva meta! ¡A por ella!" };
  }

  if (method === "GET" && path === "/kid/history") {
    const kid = requireKid(state);
    return {
      kid: pubKid(kid),
      history: kidTxns(state, kid.id),
      redemptions: state.redemptions.filter((r) => r.kid_id === kid.id)
        .map((r) => ({ id: r.id, emoji: r.emoji, title: r.title, cost: r.cost, at: r.at, status: r.status }))
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    };
  }

  // ----- adulto ------------------------------------------------------------

  if (method === "GET" && path === "/parent/badge") {
    requireParent(state);
    const pinPending = state.pin_requests.filter((r) => r.status === "pending").length;
    return { pending: claimsPending(state).length + redemptionsPending(state).length + pinPending };
  }

  if (method === "GET" && path === "/parent/dashboard") {
    requireParent(state);
    const activity = state.txns
      .slice().sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 200)
      .map((t) => {
        const kid = state.kids.find((k) => k.id === t.kid_id);
        return { ...t, reason: (kid ? kid.name + ": " : "") + t.reason };
      });
    return {
      kids: state.kids.map((k) => ({
        ...pubKid(k),
        yesterday: daySummary(state, k, yStr, true),
        today: daySummary(state, k, tStr, false),
      })),
      claims: claimsPending(state),
      redemptions: redemptionsPending(state),
      pin_requests: state.pin_requests
        .filter((r) => r.status === "pending")
        .map((r) => ({ kid_name: (state.kids.find((k) => k.id === r.kid_id) || {}).name || "—", at: r.at })),
      pending: claimsPending(state).length + redemptionsPending(state).length,
      today_date: tStr,
      yesterday_date: yStr,
      activity,
    };
  }

  if (method === "GET" && path === "/parent/today") {
    requireParent(state);
    return {
      today_date: tStr,
      yesterday_date: yStr,
      rows: todayRows(state, tStr),
      yesterday_rows: yesterdayRows(state, yStr),
    };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/quests\/([^/]+)\/missed\/([^/]+)$/))) {
    const parent = requireParent(state);
    const quest = state.quests.find((q) => q.id === m[1]);
    const kid = state.kids.find((k) => k.id === m[2]);
    if (!quest || !kid) throw new ApiError("Esa quest o ese niño ya no existen.", { status: 404 });
    if (quest.repeat === "once") throw new ApiError("Las quests de una sola vez no se marcan como no realizadas.");
    const dateStr = body.date && /^\d{4}-\d{2}-\d{2}$/.test(String(body.date)) ? String(body.date) : tStr;
    if (dateStr > tStr) throw new ApiError("No puedes marcar días que aún no llegan.");
    if (!dueOn(quest, dateStr) || !assignedTo(quest, kid.id))
      throw new ApiError("Esta quest no corresponde al " + dateLabel(dateStr) + " para este niño.");
    const period = periodFor(quest, dateStr);
    if (state.claims.some((c) => c.quest_id === quest.id && c.kid_id === kid.id && c.period === period && c.status === "pending"))
      throw new ApiError("Hay una revisión pendiente de esta quest; decídela primero.");
    if (state.misses.some((x) => x.quest_id === quest.id && x.kid_id === kid.id && x.period === period))
      throw new ApiError("Esta quest ya está marcada como no realizada" + (dateStr !== tStr ? " ese día" : "") + ".");
    const penalty = round1(quest.points / 2);
    state.misses.push({ id: newId(state), quest_id: quest.id, kid_id: kid.id, period, penalty, at: nowISO() });
    const mt = addTxn(state, kid, -penalty,
      "'" + quest.title + "' no realizada" + (dateStr !== tStr ? " (" + dateLabel(dateStr) + ")" : ""),
      "missed", parent.name);
    mt.origin = "parent"; mt.origin_name = parent.name;
    // una instancia no realizada rompe las rachas de días consecutivos
    breakDayStreaks(state, kid, quest);
    return {
      rows: todayRows(state, tStr),
      yesterday_rows: yesterdayRows(state, yStr),
      message: "Se descontaron " + penalty + " puntos a " + kid.name +
        ". La instancia del " + dateLabel(dateStr) + " quedó cerrada.",
    };
  }

  // 👨 "Marcar como hecha" / "🚫 No aplica" sobre una instancia pasada que el
  // niño nunca marcó: registra la tarea como realizada (✅ 100% o 🟡 25%, con
  // origen "padre") o la cierra como no aplica (0 puntos, no rompe rachas).
  if (method === "POST" && (m = path.match(/^\/parent\/quests\/([^/]+)\/instances\/([^/]+)\/resolve$/))) {
    const parent = requireParent(state);
    const quest = state.quests.find((q) => q.id === m[1]);
    const kid = state.kids.find((k) => k.id === m[2]);
    if (!quest || !kid) throw new ApiError("Esa quest o ese niño ya no existen.", { status: 404 });
    if (!isDateInstance(quest))
      throw new ApiError("Solo las quests diarias o por días específicos se registran por fecha.");
    const dateStr = body.date && /^\d{4}-\d{2}-\d{2}$/.test(String(body.date)) ? String(body.date) : tStr;
    if (dateStr > tStr) throw new ApiError("No puedes registrar días que aún no llegan.");
    if (!dueOn(quest, dateStr) || !assignedTo(quest, kid.id))
      throw new ApiError("Esta quest no corresponde al " + dateLabel(dateStr) + " para este niño.");
    const result = ["full", "partial", "not_applicable"].includes(body.result) ? body.result : null;
    if (!result) throw new ApiError("Resultado no válido.");
    const period = periodFor(quest, dateStr);
    const claims = state.claims.filter((c) => c.quest_id === quest.id && c.kid_id === kid.id && c.period === period);
    if (claims.some((c) => c.status === "pending"))
      throw new ApiError("Hay una revisión pendiente de esta quest; decídela primero.");
    if (claims.filter((c) => c.status === "approved").length >= quest.times_per_period)
      throw new ApiError("Esta quest ya quedó registrada como hecha el " + dateLabel(dateStr) + ".");
    if (claims.some((c) => c.status === "not_applicable"))
      throw new ApiError("Esta quest ya quedó como no aplica el " + dateLabel(dateStr) + ".");
    if (state.misses.some((x) => x.quest_id === quest.id && x.kid_id === kid.id && x.period === period))
      throw new ApiError("Esta quest ya está marcada como no realizada el " + dateLabel(dateStr) + ".");
    let message;
    if (result === "not_applicable") {
      const comment = String(body.comment || "").trim().slice(0, 140) || null;
      state.claims.push({
        id: newId(state), quest_id: quest.id, kid_id: kid.id, period, date: dateStr,
        status: "not_applicable", decision: "not_applicable", completed_by: "parent",
        comment, at: nowISO(), decided_at: nowISO(),
      });
      message = "🚫 No aplica: '" + quest.title + "' del " + dateLabel(dateStr) +
        " quedó cerrada sin puntos ni penalización.";
    } else {
      const full = result === "full";
      const awarded = full ? quest.points : round1(quest.points * 0.25);
      const claim = {
        id: newId(state), quest_id: quest.id, kid_id: kid.id, period, date: dateStr,
        status: "approved", decision: full ? "approve" : "partial", awarded,
        completed_by: "parent", at: nowISO(), decided_at: nowISO(),
      };
      state.claims.push(claim);
      const t = addTxn(state, kid, awarded,
        quest.title + (full ? "" : " (hecha a medias)"),
        full ? "quest" : "partial", parent.name);
      t.origin = "parent"; t.origin_name = parent.name;
      message = (full ? "✅ Hecha correctamente: " : "🟡 Hecha a medias: ") + kid.name +
        " ganó " + awarded + " puntos — registrada por " + parent.name + ".";
      const awards = applyStreaksOnDecision(state, kid, quest, full ? "approve" : "partial", claim);
      awards.forEach((s) => {
        message += " 🔥 ¡Racha completada: " + s.name + "! +" + s.reward_points + " puntos para " + kid.name + ".";
      });
    }
    return { message };
  }

  if (method === "GET" && path === "/parent/quests") {
    requireParent(state);
    return { quests: state.quests, kids: state.kids.map(pubKid) };
  }

  if (method === "POST" && path === "/parent/quests") {
    requireParent(state);
    const data = validateQuest(state, body);
    state.quests.push({ id: newId(state), active: true, ...data });
    return { quests: state.quests, message: "Quest creada." };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/quests\/([^/]+)$/))) {
    requireParent(state);
    const quest = state.quests.find((q) => q.id === m[1]);
    if (!quest) throw new ApiError("Esa quest ya no existe.", { status: 404 });
    if (body.action === "toggle") {
      quest.active = !quest.active;
      return { quests: state.quests, message: quest.active ? "Quest reactivada." : "Quest pausada." };
    }
    if (body.action === "delete") {
      state.quests = state.quests.filter((q) => q.id !== quest.id);
      state.claims = state.claims.filter((c) => c.quest_id !== quest.id);
      state.misses = state.misses.filter((x) => x.quest_id !== quest.id);
      state.steps = state.steps.filter((t) => t.quest_id !== quest.id);
      // las rachas ligadas a la quest desaparecen con ella (y su progreso)
      state.streaks.filter((s) => s.quest_id === quest.id).forEach(removeStreak.bind(null, state));
      return { quests: state.quests, message: "Quest eliminada." };
    }
    Object.assign(quest, validateQuest(state, body));
    return { quests: state.quests, message: "Quest actualizada." };
  }

  if (method === "GET" && path === "/parent/approvals") {
    requireParent(state);
    return { claims: claimsPending(state), redemptions: redemptionsPending(state) };
  }

  // La decisión del adulto es definitiva y define el pago:
  // ✅ hecha correctamente 100% · 🟡 hecha a medias 25% · ❌ no realizada -50%
  // · 🚫 no aplica 0 puntos (sin transacción y sin afectar rachas).
  if (method === "POST" && (m = path.match(/^\/parent\/claims\/([^/]+)$/))) {
    const parent = requireParent(state);
    const claim = state.claims.find((c) => c.id === m[1]);
    if (!claim) throw new ApiError("Esa revisión ya no existe.", { status: 404 });
    if (claim.status !== "pending") throw new ApiError("Esta quest ya fue revisada.");
    const quest = state.quests.find((q) => q.id === claim.quest_id);
    const kid = state.kids.find((k) => k.id === claim.kid_id);
    let message;
    if (body.decision === "approve") {
      claim.status = "approved";
      claim.decision = "approve";
      claim.awarded = quest ? quest.points : 0;
      claim.decided_at = nowISO();
      if (quest && kid) {
        const t = addTxn(state, kid, quest.points, quest.title, "quest", parent.name);
        t.origin = claim.completed_by || "kid";
        t.origin_name = claim.completed_by === "parent" ? parent.name : kid.name;
        if (quest.repeat === "once") quest.completed_once = true;
      }
      message = "✅ Hecha correctamente: " + (kid ? kid.name : "el niño") +
        " ganó " + (quest ? quest.points : 0) + " puntos (100%).";
    } else if (body.decision === "partial") {
      const awarded = quest ? round1(quest.points * 0.25) : 0;
      claim.status = "approved";
      claim.decision = "partial";
      claim.awarded = awarded;
      claim.decided_at = nowISO();
      if (quest && kid) {
        const t = addTxn(state, kid, awarded, quest.title + " (hecha a medias)", "partial", parent.name);
        t.origin = claim.completed_by || "kid";
        t.origin_name = claim.completed_by === "parent" ? parent.name : kid.name;
        if (quest.repeat === "once") quest.completed_once = true;
      }
      message = "🟡 Hecha a medias: " + (kid ? kid.name : "el niño") +
        " ganó solo " + awarded + " puntos (25% de " + (quest ? quest.points : 0) + ").";
    } else if (body.decision === "not_done") {
      const penalty = quest ? round1(quest.points / 2) : 0;
      claim.status = "missed";
      claim.decision = "not_done";
      claim.penalty = -penalty;
      claim.decided_at = nowISO();
      if (quest && kid) {
        state.misses.push({ id: newId(state), quest_id: quest.id, kid_id: kid.id, period: claim.period, penalty, at: nowISO() });
        const t = addTxn(state, kid, -penalty, "'" + quest.title + "' no realizada (dijo que la hizo)", "missed", parent.name);
        t.origin = "parent"; t.origin_name = parent.name;
      }
      message = "❌ No realizada: se descontaron " + penalty + " puntos a " +
        (kid ? kid.name : "el niño") + " (50%).";
    } else if (body.decision === "not_applicable") {
      // 🚫 No aplica: cuarto resultado independiente — 0 puntos, sin
      // penalización, sin transacción y sin afectar rachas.
      claim.status = "not_applicable";
      claim.decision = "not_applicable";
      claim.decided_at = nowISO();
      claim.comment = String(body.comment || "").trim().slice(0, 140) || null;
      message = "🚫 No aplica: '" + (quest ? quest.title : "la quest") +
        "' quedó cerrada sin puntos ni penalización para " +
        (kid ? kid.name : "el niño") + (claim.comment ? " (" + claim.comment + ")" : "") + ".";
    } else {
      throw new ApiError("Decisión no válida.");
    }
    // Las rachas reaccionan a la decisión (solo el 100% suma; la no realizada
    // rompe las de días consecutivos; a medias y no aplica no cuentan ni rompen).
    if (quest && kid) {
      const awards = applyStreaksOnDecision(state, kid, quest, body.decision, claim);
      awards.forEach((s) => {
        message += " 🔥 ¡Racha completada: " + s.name + "! +" + s.reward_points + " puntos para " + kid.name + ".";
      });
    }
    return { claims: claimsPending(state), redemptions: redemptionsPending(state), message };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/redemptions\/([^/]+)$/))) {
    const parent = requireParent(state);
    const redemption = state.redemptions.find((r) => r.id === m[1]);
    if (!redemption) throw new ApiError("Ese canje ya no existe.", { status: 404 });
    if (redemption.status !== "pending") throw new ApiError("Este canje ya fue decidido.");
    const kid = state.kids.find((k) => k.id === redemption.kid_id);
    const reward = state.rewards.find((r) => r.id === redemption.reward_id);
    let message;
    if (body.decision === "approve") {
      redemption.status = "approved";
      redemption.decided_at = nowISO();
      message = "¡Entregada! Que la disfrute " + (kid ? kid.name : "") + ".";
    } else {
      redemption.status = "rejected";
      redemption.decided_at = nowISO();
      if (kid) addTxn(state, kid, redemption.cost, "Reembolso: " + redemption.title, "refund", parent.name);
      if (reward && reward.stock_mode === "fixed") reward.stock += 1;
      message = "Rechazada — los puntos vuelven a " + (kid ? kid.name : "el niño") + ".";
    }
    return { claims: claimsPending(state), redemptions: redemptionsPending(state), message };
  }

  // ----- rachas (adulto) ---------------------------------------------------

  if (method === "GET" && path === "/parent/streaks") {
    requireParent(state);
    return { streaks: state.streaks.map((s) => pubStreak(state, s)) };
  }

  if (method === "POST" && path === "/parent/streaks") {
    requireParent(state);
    const data = validateStreak(state, body);
    state.streaks.push({ id: newId(state), active: body.active === undefined ? true : !!body.active, ...data });
    return { streaks: state.streaks.map((s) => pubStreak(state, s)), message: "Racha creada." };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/streaks\/([^/]+)$/))) {
    requireParent(state);
    const streak = state.streaks.find((s) => s.id === m[1]);
    if (!streak) throw new ApiError("Esa racha ya no existe.", { status: 404 });
    if (body.action === "toggle") {
      streak.active = !streak.active;
      return { streaks: state.streaks.map((s) => pubStreak(state, s)), message: streak.active ? "Racha activada." : "Racha pausada." };
    }
    if (body.action === "delete") {
      removeStreak(state, streak);
      return { streaks: state.streaks.map((s) => pubStreak(state, s)), message: "Racha eliminada." };
    }
    Object.assign(streak, validateStreak(state, body));
    return { streaks: state.streaks.map((s) => pubStreak(state, s)), message: "Racha actualizada." };
  }

  // ----- copias de seguridad y reinicio de progreso -------------------------

  if (method === "GET" && path === "/parent/backups") {
    requireParent(state);
    return { backups: listBackups(state) };
  }

  if (method === "POST" && path === "/parent/progress/reset") {
    requireParent(state);
    return resetProgress(state);
  }

  if (method === "POST" && (m = path.match(/^\/parent\/backups\/([^/]+)\/restore$/))) {
    requireParent(state);
    return restoreBackup(state, m[1]);
  }

  // ----- PIN (adulto): solicitudes de los niños ----------------------------

  if (method === "GET" && path === "/parent/pin-requests") {
    requireParent(state);
    return {
      requests: state.pin_requests
        .filter((r) => r.status === "pending")
        .map((r) => ({
          id: r.id, kid_id: r.kid_id,
          kid_name: (state.kids.find((k) => k.id === r.kid_id) || {}).name || "—",
          at: r.at,
        }))
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
      kids: state.kids.map((k) => ({ id: k.id, name: k.name, avatar: k.avatar, has_pin: !!k.pin })),
    };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/pin-requests\/([^/]+)$/))) {
    requireParent(state);
    const req = state.pin_requests.find((r) => r.id === m[1]);
    if (!req) throw new ApiError("Esa solicitud ya no existe.", { status: 404 });
    if (req.status !== "pending") throw new ApiError("Esa solicitud ya fue revisada.");
    const kid = state.kids.find((k) => k.id === req.kid_id);
    if (body.action === "reject") {
      req.status = "rejected";
      req.decided_at = nowISO();
      return { message: "Solicitud rechazada." };
    }
    // aprobar: PIN nuevo opcional (vacío = dejar sin PIN por ahora)
    const pin = String(body.pin || "").trim();
    if (pin && !/^\d{4,6}$/.test(pin)) throw new ApiError("El PIN debe tener entre 4 y 6 dígitos.");
    req.status = "approved";
    req.decided_at = nowISO();
    let message = "Solicitud aprobada.";
    if (kid) {
      kid.pin = pin || null;
      message = pin
        ? "PIN restablecido para " + kid.name + "."
        : kid.name + " quedó sin PIN: podrá crear uno nuevo desde su perfil.";
    }
    return {
      message,
      requests: state.pin_requests
        .filter((r) => r.status === "pending")
        .map((r) => ({ id: r.id, kid_id: r.kid_id, kid_name: (state.kids.find((k) => k.id === r.kid_id) || {}).name || "—", at: r.at })),
      kids: state.kids.map((k) => ({ id: k.id, name: k.name, avatar: k.avatar, has_pin: !!k.pin })),
    };
  }

  if (method === "GET" && path === "/parent/rewards") {
    requireParent(state);
    return { rewards: state.rewards };
  }

  if (method === "POST" && path === "/parent/rewards") {
    requireParent(state);
    state.rewards.push({ id: newId(state), active: true, ...validateReward(body) });
    return { rewards: state.rewards, message: "Recompensa creada." };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/rewards\/([^/]+)$/))) {
    requireParent(state);
    const reward = state.rewards.find((r) => r.id === m[1]);
    if (!reward) throw new ApiError("Esa recompensa ya no existe.", { status: 404 });
    if (body.action === "toggle") {
      reward.active = !reward.active;
      return { rewards: state.rewards, message: reward.active ? "Recompensa activada." : "Recompensa pausada." };
    }
    if (body.action === "delete") {
      state.rewards = state.rewards.filter((r) => r.id !== reward.id);
      state.kids.forEach((k) => { if (k.goal_id === reward.id) k.goal_id = null; });
      return { rewards: state.rewards, message: "Recompensa eliminada." };
    }
    Object.assign(reward, validateReward(body));
    return { rewards: state.rewards, message: "Recompensa actualizada." };
  }

  if (method === "GET" && path === "/parent/kids") {
    requireParent(state);
    return { kids: state.kids.map(pubKid), parents: [{ name: state.parent.name }] };
  }

  if (method === "POST" && path === "/parent/kids") {
    requireParent(state);
    const name = String(body.name || "").trim();
    if (!name) throw new ApiError("Ponle un nombre.");
    const pin = String(body.pin || "").trim();
    if (pin && !/^\d{4,6}$/.test(pin)) throw new ApiError("El PIN debe tener entre 4 y 6 dígitos.");
    const points = Math.max(0, Math.min(100000, Number(body.points) || 0));
    const kid = {
      id: newId(state), name: name.slice(0, 40),
      avatar: String(body.avatar || "🦊").slice(0, 4),
      color: /^#[0-9a-fA-F]{6}$/.test(body.color || "") ? body.color : "#7c4dff",
      pin: pin || null, points, lifetime_points: points, goal_id: null,
    };
    state.kids.push(kid);
    return { kids: state.kids.map(pubKid), message: "¡" + kid.name + " se unió a la familia!" };
  }

  if (method === "GET" && (m = path.match(/^\/parent\/kids\/([^/]+)$/))) {
    requireParent(state);
    const kid = state.kids.find((k) => k.id === m[1]);
    if (!kid) throw new ApiError("Ese niño ya no existe.", { status: 404 });
    return {
      kid: pubKid(kid),
      today_date: tStr,
      yesterday_date: yStr,
      yesterday: { date: yStr, items: dayItems(state, kid, yStr) },
      today: { date: tStr, quests: kidQuests(state, kid, tStr) },
      history: kidTxns(state, kid.id),
      redemptions: state.redemptions.filter((r) => r.kid_id === kid.id)
        .map((r) => ({ id: r.id, emoji: r.emoji, title: r.title, cost: r.cost, at: r.at, status: r.status }))
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/kids\/([^/]+)$/))) {
    requireParent(state);
    const kid = state.kids.find((k) => k.id === m[1]);
    if (!kid) throw new ApiError("Ese niño ya no existe.", { status: 404 });
    if (body.action === "delete") {
      state.kids = state.kids.filter((k) => k.id !== kid.id);
      state.claims = state.claims.filter((c) => c.kid_id !== kid.id);
      state.misses = state.misses.filter((x) => x.kid_id !== kid.id);
      state.steps = state.steps.filter((t) => t.kid_id !== kid.id);
      state.txns = state.txns.filter((t) => t.kid_id !== kid.id);
      state.redemptions = state.redemptions.filter((r) => r.kid_id !== kid.id);
      state.pin_requests = state.pin_requests.filter((r) => r.kid_id !== kid.id);
      state.quests.forEach((q) => { q.assigned_to = (q.assigned_to || []).filter((id) => id !== kid.id); });
      state.streaks.forEach((s) => { if (s.kid_id === kid.id) s.kid_id = null; });
      Object.keys(state.streak_progress).forEach((k) => { if (k.endsWith("|" + kid.id)) delete state.streak_progress[k]; });
      return { kids: state.kids.map(pubKid), message: kid.name + " fue eliminado." };
    }
    const name = String(body.name || kid.name).trim();
    if (name) kid.name = name.slice(0, 40);
    if (body.avatar) kid.avatar = String(body.avatar).slice(0, 4);
    if (/^#[0-9a-fA-F]{6}$/.test(body.color || "")) kid.color = body.color;
    if (body.action === "pin" || body.pin !== undefined) {
      const pin = String(body.pin || "").trim();
      if (pin && !/^\d{4,6}$/.test(pin)) throw new ApiError("El PIN debe tener entre 4 y 6 dígitos.");
      kid.pin = pin || null;
    }
    return { kids: state.kids.map(pubKid), message: "Datos actualizados." };
  }

  if (method === "POST" && path === "/parent/award") {
    const parent = requireParent(state);
    const kid = state.kids.find((k) => k.id === body.kid_id);
    if (!kid) throw new ApiError("Ese niño ya no existe.", { status: 404 });
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000)
      throw new ApiError("La cantidad debe estar entre 1 y 100000 puntos.");
    const negate = !!body.negate;
    const reason = String(body.reason || "").trim() ||
      (negate ? "Puntos quitados por un adulto" : "Puntos de regalo");
    addTxn(state, kid, negate ? -amount : amount, reason, negate ? "deduct" : "award", parent.name);
    return {
      message: "Se le " + (negate ? "quitaron" : "dieron") + " " + amount + " puntos a " + kid.name + ".",
    };
  }

  throw new ApiError("Ruta no encontrada: " + method + " " + path, { status: 404 });
}

// ---------------------------------------------------------------------------
// punto de entrada
// ---------------------------------------------------------------------------

export async function storeApi(path, { method = "GET", body } = {}) {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  const state = load();
  const result = handle(state, method, path, body || {});
  save(state);
  return result;
}