// MODO DEMO — backend completo sobre localStorage que reproduce las reglas de
// negocio de questly/app/models.py: períodos (día/semana/mes), claims con
// aprobación, penalización "missed" del 50%, stock de recompensas, metas de
// ahorro y transacciones. Expone exactamente la misma interfaz que el API
// Flask, para que los componentes no sepan cuál se está usando.

import { ApiError } from "@/services/error";
import { getToken } from "@/services/session";

const KEY = "questly_demo_v1";
const DELAY_MS = 90; // latencia simulada para que se vean los estados de carga

// ---------------------------------------------------------------------------
// estado y persistencia
// ---------------------------------------------------------------------------

function seedState() {
  return {
    seq: 1000,
    parent: { id: "p1", name: "Papá / CMB", avatar: "👨", password: "admin" },
    kids: [
      { id: "k1", name: "Samuel", avatar: "🐼", color: "#2563eb", pin: "1234", points: 120, lifetime_points: 120, goal_id: null },
      { id: "k2", name: "Lorenza", avatar: "🦄", color: "#d946ef", pin: "5678", points: 85, lifetime_points: 85, goal_id: null },
    ],
    quests: [
      { id: "q1", title: "Hacer la cama", emoji: "🛏️", description: "", points: 5, repeat: "daily", repeat_days: [], times_per_period: 1, assigned_to: ["k1"], subtasks: [], active: true },
      { id: "q2", title: "Lavarse los dientes", emoji: "🦷", description: "Antes de dormir, sin excusas", points: 5, repeat: "daily", repeat_days: [], times_per_period: 1, assigned_to: ["k2"], subtasks: [], active: true },
      { id: "q3", title: "Ordenar habitación", emoji: "🧹", description: "", points: 10, repeat: "custom_days", repeat_days: [0, 1, 2, 3, 4], times_per_period: 1, assigned_to: ["k1"], subtasks: [], active: true },
      { id: "q4", title: "Sacar la basura", emoji: "🗑️", description: "", points: 15, repeat: "custom_days", repeat_days: [1, 3, 5], times_per_period: 1, assigned_to: ["k2"], subtasks: [], active: true },
      { id: "q5", title: "Ordenar el clóset", emoji: "📦", description: "Toda la ropa en su lugar", points: 30, repeat: "once", repeat_days: [], times_per_period: 1, assigned_to: ["k1"], subtasks: [], active: true, due_date: "2026-09-28" },
      { id: "q6", title: "Limpiar patio", emoji: "🌿", description: "", points: 20, repeat: "weekly", repeat_days: [], times_per_period: 1, assigned_to: [], subtasks: [], active: true },
    ],
    rewards: [
      { id: "r1", title: "Helado", emoji: "🍦", cost: 50, description: "El sabor que quieras", stock_mode: "unlimited", stock: 0, stock_limit: 1, stock_period: "daily", stock_scope: "child", active: true },
      { id: "r2", title: "Jugar videojuegos", emoji: "🎮", cost: 100, description: "Una hora extra", stock_mode: "unlimited", stock: 0, stock_limit: 1, stock_period: "daily", stock_scope: "child", active: true },
      { id: "r3", title: "Elegir película", emoji: "🎬", cost: 150, description: "La película familiar la eliges tú", stock_mode: "unlimited", stock: 0, stock_limit: 1, stock_period: "daily", stock_scope: "child", active: true },
    ],
    claims: [],       // {id, quest_id, kid_id, period, status, at, decided_at}
    misses: [],       // {id, quest_id, kid_id, period, penalty, at}
    steps: [],        // {quest_id, kid_id, period, subtask_id}
    txns: [],         // {id, kid_id, delta, reason, kind, at, actor, balance_after}
    redemptions: [],  // {id, reward_id, kid_id, title, emoji, cost, status, at, decided_at}
    sessions: {},     // token -> {user_id, role}
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : seedState();
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
// helpers de tiempo (fechas locales, como el backend)
// ---------------------------------------------------------------------------

const nowISO = () => new Date().toISOString();
const round1 = (n) => Math.round(Number(n) * 10) / 10;

function ymd(d) {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function monday(d) {
  const c = new Date(d);
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  return c;
}

const questlyWeekday = (d) => (d.getDay() + 6) % 7; // 0 = lunes … 6 = domingo

function periodFor(quest, d) {
  switch (quest.repeat) {
    case "daily":
    case "custom_days":
      return "d:" + ymd(d);
    case "weekly":
      return "w:" + ymd(monday(d));
    case "monthly":
      return "m:" + ymd(d).slice(0, 7);
    default:
      return "once";
  }
}

function dueToday(quest, d) {
  if (!quest.active) return false;
  if (quest.repeat === "custom_days") return (quest.repeat_days || []).includes(questlyWeekday(d));
  if (quest.repeat === "once") return !quest.completed_once;
  return true; // daily, weekly, monthly
}

const assignedTo = (quest, kidId) =>
  !quest.assigned_to || !quest.assigned_to.length || quest.assigned_to.includes(kidId);

const periodLabel = (repeat) =>
  repeat === "weekly" ? "esta semana" : repeat === "monthly" ? "este mes" : "hoy";

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

function questForKid(state, quest, kid, d) {
  const period = periodFor(quest, d);
  const claims = state.claims.filter((c) => c.quest_id === quest.id && c.kid_id === kid.id && c.period === period);
  const missed = state.misses.some((m) => m.quest_id === quest.id && m.kid_id === kid.id && m.period === period);
  const approved = claims.filter((c) => c.status === "approved").length;
  const pending = claims.some((c) => c.status === "pending");
  const subtasks = quest.subtasks.map((s) => ({
    id: s.id,
    text: s.text,
    done: state.steps.some((t) => t.quest_id === quest.id && t.kid_id === kid.id && t.period === period && t.subtask_id === s.id),
  }));
  const stepsDone = subtasks.filter((s) => s.done).length;
  let st = "open";
  if (missed) st = "missed";
  else if (pending) st = "pending";
  else if (approved >= quest.times_per_period) st = "done";
  return {
    id: quest.id, title: quest.title, emoji: quest.emoji, description: quest.description,
    points: quest.points, repeat: quest.repeat, repeat_days: quest.repeat_days || [],
    limit: quest.times_per_period, used: claims.filter((c) => c.status !== "rejected").length,
    subtasks, steps_total: subtasks.length, steps_done: stepsDone,
    state: st, penalty: round1(quest.points / 2), due_date: quest.due_date || null,
  };
}

function kidQuests(state, kid, d) {
  return state.quests
    .filter((q) => assignedTo(q, kid.id) && dueToday(q, d))
    .map((q) => questForKid(state, q, kid, d));
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

function todayRows(state, d) {
  return state.kids.map((kid) => ({ kid: pubKid(kid), quests: kidQuests(state, kid, d) }));
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
  if (!Number.isFinite(points) || points < 1 || points > 1000)
    throw new ApiError("Los puntos deben estar entre 1 y 1000.");
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
    throw new ApiError("El costo debe estar entre 1 y 100000 puntos.");
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
  const d = new Date();
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
      quests: kidQuests(state, kid, d),
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
    if (!dueToday(quest, d)) throw new ApiError("Esta quest no toca hoy.");
    const period = periodFor(quest, d);
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
    state.claims.push({ id: newId(state), quest_id: quest.id, kid_id: kid.id, period, status: "pending", at: nowISO() });
    return { kid: pubKid(kid), quests: kidQuests(state, kid, d), message: "¡Listo! Ahora queda esperando que un adulto la revise." };
  }

  if (method === "POST" && (m = path.match(/^\/kid\/quests\/([^/]+)\/step\/([^/]+)$/))) {
    const kid = requireKid(state);
    const quest = state.quests.find((q) => q.id === m[1]);
    if (!quest) throw new ApiError("Esta quest ya no existe.");
    const step = quest.subtasks.find((s) => s.id === m[2]);
    if (!step) throw new ApiError("Ese paso no existe.");
    const period = periodFor(quest, d);
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
        const dd = new Date(at);
        if (reward.stock_period === "daily") return "d:" + ymd(dd);
        if (reward.stock_period === "weekly") return "w:" + ymd(monday(dd));
        return "m:" + ymd(dd).slice(0, 7);
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
      kids: state.kids.map(pubKid),
      claims: claimsPending(state),
      redemptions: redemptionsPending(state),
      pending: claimsPending(state).length + redemptionsPending(state).length,
      today: todayRows(state, d),
      activity,
    };
  }

  if (method === "GET" && path === "/parent/today") {
    requireParent(state);
    return { rows: todayRows(state, d) };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/quests\/([^/]+)\/missed\/([^/]+)$/))) {
    const parent = requireParent(state);
    const quest = state.quests.find((q) => q.id === m[1]);
    const kid = state.kids.find((k) => k.id === m[2]);
    if (!quest || !kid) throw new ApiError("Esa quest o ese niño ya no existen.", { status: 404 });
    if (quest.repeat === "once") throw new ApiError("Las quests de una sola vez no se marcan como no realizadas.");
    if (!dueToday(quest, d) || !assignedTo(quest, kid.id)) throw new ApiError("Esta quest no toca hoy para este niño.");
    const period = periodFor(quest, d);
    if (state.claims.some((c) => c.quest_id === quest.id && c.kid_id === kid.id && c.period === period && c.status === "pending"))
      throw new ApiError("Hay una revisión pendiente de esta quest; decídela primero.");
    if (state.misses.some((x) => x.quest_id === quest.id && x.kid_id === kid.id && x.period === period))
      throw new ApiError("Ya está marcada como no realizada " + periodLabel(quest.repeat) + ".");
    const penalty = round1(quest.points / 2);
    state.misses.push({ id: newId(state), quest_id: quest.id, kid_id: kid.id, period, penalty, at: nowISO() });
    addTxn(state, kid, -penalty, "'" + quest.title + "' no realizada", "missed", parent.name);
    return {
      rows: todayRows(state, d),
      message: "Se descontaron " + penalty + " puntos a " + kid.name + ". La quest quedó cerrada " + periodLabel(quest.repeat) + ".",
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
      claim.decided_at = nowISO();
      if (quest && kid) {
        addTxn(state, kid, quest.points, quest.title, "quest", parent.name);
        if (quest.repeat === "once") quest.completed_once = true;
      }
      message = "¡Aprobada!" + (kid ? " " + kid.name + " ganó " + (quest ? quest.points : "") + " puntos." : "");
    } else {
      claim.status = "rejected";
      claim.decided_at = nowISO();
      message = "Rechazada — la quest vuelve a estar disponible para " + (kid ? kid.name : "el niño") + ".";
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