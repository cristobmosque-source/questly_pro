// MODO DEMO — backend completo sobre localStorage que reproduce las reglas de
// negocio de questly/app: instancias por fecha (AYER/HOY) para quests diarias
// y custom_days, cierre automático de instancias vencidas ("no realizada"),
// penalización del 50% única por instancia, aprobación de claims, stock de
// recompensas, metas de ahorro y transacciones. Zona horaria: America/Santiago.
// Expone exactamente la misma interfaz que el API Flask, para que los
// componentes no sepan cuál se está usando.

import { ApiError } from "@/services/error";
import { getToken } from "@/services/session";

const KEY = "questly_demo_v2";
const DELAY_MS = 90; // latencia simulada para que se vean los estados de carga
const TZ = "America/Santiago";

// ---------------------------------------------------------------------------
// estado y persistencia
// ---------------------------------------------------------------------------

function seedState() {
  return {
    seq: 100,
    parent: { id: "p1", name: "Papá / CMB", avatar: "👨", password: "admin" },
    kids: [
      { id: "k1", name: "Samuel", avatar: "🐼", color: "#2563eb", pin: "1234", points: 8500, lifetime_points: 8500, goal_id: null },
      { id: "k2", name: "Lorenza", avatar: "🦄", color: "#d946ef", pin: "5678", points: 6250, lifetime_points: 6750, goal_id: null },
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
    // instancias por fecha (d:YYYY-MM-DD); semanal/mensual/once usan su propio bucket
    claims: [
      { id: "c1", quest_id: "q1", kid_id: "k1", period: "d:2026-09-24", date: "2026-09-24", status: "approved", at: "2026-09-24T19:30:00.000Z", decided_at: "2026-09-24T19:35:00.000Z" },
      { id: "c2", quest_id: "q1", kid_id: "k1", period: "d:2026-09-25", date: "2026-09-25", status: "approved", at: "2026-09-25T08:10:00.000Z", decided_at: "2026-09-25T08:20:00.000Z" },
      { id: "c3", quest_id: "q2", kid_id: "k1", period: "d:2026-09-25", date: "2026-09-25", status: "approved", at: "2026-09-25T09:00:00.000Z", decided_at: "2026-09-25T09:10:00.000Z" },
      { id: "c4", quest_id: "q1", kid_id: "k2", period: "d:2026-09-25", date: "2026-09-25", status: "approved", at: "2026-09-25T08:05:00.000Z", decided_at: "2026-09-25T08:15:00.000Z" },
      { id: "c5", quest_id: "q3", kid_id: "k2", period: "d:2026-09-24", date: "2026-09-24", status: "approved", at: "2026-09-24T18:45:00.000Z", decided_at: "2026-09-24T18:50:00.000Z" },
    ],
    // una penalización por instancia (quest_id + kid_id + period)
    misses: [
      { id: "m1", quest_id: "q2", kid_id: "k2", period: "d:2026-09-25", penalty: 500, at: "2026-09-25T09:15:00.000Z" },
    ],
    steps: [],         // {quest_id, kid_id, period, subtask_id}
    txns: [
      { id: "t1", kid_id: "k1", delta: 6500, reason: "Puntos de bienvenida", kind: "award", at: "2026-09-20T10:00:00.000Z", actor: "Papá / CMB", balance_after: 6500 },
      { id: "t5", kid_id: "k2", delta: 5500, reason: "Puntos de bienvenida", kind: "award", at: "2026-09-20T10:05:00.000Z", actor: "Papá / CMB", balance_after: 5500 },
      { id: "t6", kid_id: "k2", delta: 750, reason: "Sacar la basura", kind: "quest", at: "2026-09-24T18:50:00.000Z", actor: "Papá / CMB", balance_after: 6250 },
      { id: "t2", kid_id: "k1", delta: 500, reason: "Hacer la cama", kind: "quest", at: "2026-09-24T19:35:00.000Z", actor: "Papá / CMB", balance_after: 7000 },
      { id: "t4", kid_id: "k2", delta: 500, reason: "Hacer la cama", kind: "quest", at: "2026-09-25T08:15:00.000Z", actor: "Papá / CMB", balance_after: 6750 },
      { id: "t3", kid_id: "k1", delta: 500, reason: "Hacer la cama", kind: "quest", at: "2026-09-25T08:20:00.000Z", actor: "Papá / CMB", balance_after: 7500 },
      { id: "t8", kid_id: "k2", delta: -500, reason: "'Ordenar habitación' no realizada (vie 25 sept)", kind: "missed", at: "2026-09-25T09:15:00.000Z", actor: "Papá / CMB", balance_after: 6250 },
      { id: "t7", kid_id: "k1", delta: 1000, reason: "Ordenar habitación", kind: "quest", at: "2026-09-25T09:10:00.000Z", actor: "Papá / CMB", balance_after: 8500 },
    ],
    redemptions: [],  // {id, reward_id, kid_id, title, emoji, cost, status, at, decided_at}
    sessions: {},     // token -> {user_id, role}
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    cache = parsed && parsed.txns ? parsed : seedState();
  } catch {
    cache = seedState();
  }
  save(cache);
  return cache;
}

function save(state) {
  cache = state;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* sin espacio: seguimos en memoria */ }
}

export function restoreDemoData() {
  cache = null;
  try { localStorage.removeItem(KEY); } catch { /* nada */ }
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
    .map((q) => ({
      id: q.id, title: q.title, emoji: q.emoji, points: q.points,
      penalty: round1(q.points / 2),
      state: instanceState(state, q, kid.id, dateStr),
      penalty_applied: penaltyApplied(state, q, kid.id, dateStr),
    }));
}

function daySummary(state, kid, dateStr, onlyDateInstances) {
  const items = onlyDateInstances ? dayItems(state, kid, dateStr) : kidQuests(state, kid, dateStr);
  const count = (s) => items.filter((i) => i.state === s).length;
  return { done: count("done"), pending: count("pending"), rejected: count("rejected"), missed: count("missed"), open: count("open") };
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
  const token = "demo-" + role + "-" + user_id + "-" + Math.random().toString(36).slice(2, 8);
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
// dispatcher de rutas (mismos paths que el API Flask)
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
    throw new ApiError("En el modo demo la familia ya está configurada (contraseña del adulto: admin).");

  if (method === "POST" && path === "/auth/kid") {
    const kid = state.kids.find((k) => k.id === body.kid_id);
    if (!kid) throw new ApiError("Ese perfil ya no existe.", { status: 404 });
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
    if (claims.filter((c) => c.status === "approved").length >= quest.times_per_period)
      throw new ApiError("Ya completaste esta quest " + periodLabel(quest.repeat) + ".");
    const stepsDone = state.steps.filter((t) => t.quest_id === quest.id && t.kid_id === kid.id && t.period === period).length;
    if (quest.subtasks.length && stepsDone < quest.subtasks.length)
      throw new ApiError("Te faltan pasos por marcar antes de decir ¡listo!.");
    state.claims.push({ id: newId(state), quest_id: quest.id, kid_id: kid.id, period, date: isDateInstance(quest) ? tStr : null, status: "pending", at: nowISO() });
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
    return { pending: claimsPending(state).length + redemptionsPending(state).length };
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
    addTxn(state, kid, -penalty,
      "'" + quest.title + "' no realizada" + (dateStr !== tStr ? " (" + dateLabel(dateStr) + ")" : ""),
      "missed", parent.name);
    return {
      rows: todayRows(state, tStr),
      yesterday_rows: yesterdayRows(state, yStr),
      message: "Se descontaron " + penalty + " puntos a " + kid.name +
        ". La instancia del " + dateLabel(dateStr) + " quedó cerrada.",
    };
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
  // ✅ hecha correctamente 100% · 🟡 hecha a medias 25% · ❌ no realizada -50%.
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
        addTxn(state, kid, quest.points, quest.title, "quest", parent.name);
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
        addTxn(state, kid, awarded, quest.title + " (hecha a medias)", "partial", parent.name);
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
        addTxn(state, kid, -penalty, "'" + quest.title + "' no realizada (dijo que la hizo)", "missed", parent.name);
      }
      message = "❌ No realizada: se descontaron " + penalty + " puntos a " +
        (kid ? kid.name : "el niño") + " (50%).";
    } else {
      throw new ApiError("Decisión no válida.");
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
      state.quests.forEach((q) => { q.assigned_to = (q.assigned_to || []).filter((id) => id !== kid.id); });
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
// punto de entrada (misma firma que el cliente HTTP)
// ---------------------------------------------------------------------------

export async function demoApi(path, { method = "GET", body } = {}) {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  const state = load();
  const result = handle(state, method, path, body || {});
  save(state);
  return result;
}