// DOMINIO PURO DE QUESTLY — fechas (America/Santiago), estados de instancias,
// resúmenes, pendientes de revisión, rachas y copias de seguridad. Lo consume
// el dispatcher de rutas de store.js; aquí no hay localStorage ni sesiones.
//
// Estados de una instancia:
//   open            → disponible para realizarse
//   pending         → el niño la marcó; espera revisión (PENDING_APPROVAL)
//   pending_review  → venció sin resultado; el adulto decide (PENDING_REVIEW)
//   done            → aprobada (100% o 25%)
//   missed          → no realizada con penalización aplicada (solo decisión adulto)
//   rejected        → rechazada
//   not_applicable  → no aplicaba (0 puntos, no rompe rachas)

import { ApiError } from "@/services/error";

const TZ = "America/Santiago";

// Copias de seguridad del reinicio: se conservan 30 días exactos.
const BACKUP_VERSION = 1;
const BACKUP_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// helpers de tiempo — todo en la zona horaria America/Santiago
// ---------------------------------------------------------------------------

export const nowISO = () => new Date().toISOString();
export const round1 = (n) => Math.round(Number(n) * 10) / 10;

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
});

// fecha local (Santiago) en formato YYYY-MM-DD
export const ymd = (d = new Date()) => dateFmt.format(d);

function addDaysStr(dateStr, n) {
  return ymd(new Date(Date.parse(dateStr + "T12:00:00Z") + n * 86400000));
}

export const todayStr = () => ymd(new Date());
export const yesterdayStr = () => addDaysStr(todayStr(), -1);

// 0 = lunes … 6 = domingo (convención de Questly)
const questlyWeekday = (dateStr) => (new Date(dateStr + "T12:00:00Z").getUTCDay() + 6) % 7;

export const mondayStr = (dateStr) => addDaysStr(dateStr, -questlyWeekday(dateStr));

export function periodFor(quest, dateStr) {
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
export const isDateInstance = (quest) => quest.repeat === "daily" || quest.repeat === "custom_days";

export function dueOn(quest, dateStr) {
  if (!quest.active) return false;
  if (quest.repeat === "custom_days") return (quest.repeat_days || []).includes(questlyWeekday(dateStr));
  if (quest.repeat === "once") return !quest.completed_once;
  return true; // daily, weekly, monthly
}

export const assignedTo = (quest, kidId) =>
  !quest.assigned_to || !quest.assigned_to.length || quest.assigned_to.includes(kidId);

export const periodLabel = (repeat) =>
  repeat === "weekly" ? "esta semana" : repeat === "monthly" ? "este mes" : "hoy";

export function dateLabel(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// helpers de dominio
// ---------------------------------------------------------------------------

// Nunca expone el PIN: solo si existe.
export function pubKid(k) {
  return { id: k.id, name: k.name, avatar: k.avatar, color: k.color, points: k.points, lifetime_points: k.lifetime_points, has_pin: !!k.pin };
}

export function newId(state) {
  state.seq += 1;
  return "e" + state.seq;
}

export function addTxn(state, kid, delta, reason, kind, actor = null) {
  kid.points = round1(kid.points + delta);
  if (delta > 0) kid.lifetime_points = round1(kid.lifetime_points + delta);
  const t = { id: newId(state), kid_id: kid.id, delta: round1(delta), reason, kind, at: nowISO(), actor, balance_after: kid.points };
  state.txns.push(t);
  return t;
}

export const kidTxns = (state, kidId) =>
  state.txns.filter((t) => t.kid_id === kidId).sort((a, b) => (a.at < b.at ? 1 : -1));

// Estado de la INSTANCIA de una quest en una fecha concreta.
function instanceState(state, quest, kidId, dateStr) {
  const period = periodFor(quest, dateStr);
  const claims = state.claims.filter((c) => c.quest_id === quest.id && c.kid_id === kidId && c.period === period);
  if (claims.some((c) => c.status === "pending")) return "pending";
  if (claims.some((c) => c.status === "not_applicable")) return "not_applicable";
  const approved = claims.filter((c) => c.status === "approved").length;
  if (approved >= quest.times_per_period) return "done";
  if (state.misses.some((m) => m.quest_id === quest.id && m.kid_id === kidId && m.period === period)) return "missed";
  if (claims.some((c) => c.status === "rejected")) return "rejected";
  // cierre del período: una instancia vencida sin resultado queda
  // PENDIENTE DE REVISIÓN — el adulto decide (✅/🟡/❌/🚫); nunca automática.
  if (isDateInstance(quest) && dateStr < todayStr()) return "pending_review";
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

export function kidQuests(state, kid, dateStr) {
  return state.quests
    .filter((q) => assignedTo(q, kid.id) && dueOn(q, dateStr))
    .map((q) => questForKid(state, q, kid, dateStr));
}

// Resumen de las instancias de AYER de un niño (solo quests por fecha)
export function dayItems(state, kid, dateStr) {
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

export function daySummary(state, kid, dateStr, onlyDateInstances) {
  const items = onlyDateInstances ? dayItems(state, kid, dateStr) : kidQuests(state, kid, dateStr);
  const count = (s) => items.filter((i) => i.state === s).length;
  return {
    done: count("done"), pending: count("pending"), rejected: count("rejected"),
    missed: count("missed"), pending_review: count("pending_review"),
    not_applicable: count("not_applicable"), open: count("open"),
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

export function pubReward(r) {
  return {
    id: r.id, title: r.title, emoji: r.emoji, cost: r.cost, description: r.description,
    stock_text: stockText(r), sold_out: r.stock_mode === "fixed" && r.stock <= 0,
  };
}

export function goalFor(state, kid) {
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

export function claimsPending(state) {
  return state.claims
    .filter((c) => c.status === "pending")
    .map((c) => {
      const quest = state.quests.find((q) => q.id === c.quest_id);
      const kid = state.kids.find((k) => k.id === c.kid_id);
      return { id: c.id, kid_id: c.kid_id, kid_name: kid ? kid.name : "—", title: quest ? quest.title : "Quest", emoji: quest ? quest.emoji : "⭐", points: quest ? quest.points : 0, at: c.at, completed_by: c.completed_by || "kid", date: c.date || null };
    })
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function redemptionsPending(state) {
  return state.redemptions
    .filter((r) => r.status === "pending")
    .map((r) => ({ id: r.id, kid_name: (state.kids.find((k) => k.id === r.kid_id) || {}).name || "—", title: r.title, emoji: r.emoji, cost: r.cost, at: r.at }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

// Resultado ya registrado de un período concreto (null = sin resultado).
function periodResult(state, quest, kidId, period) {
  const claims = state.claims.filter((c) => c.quest_id === quest.id && c.kid_id === kidId && c.period === period);
  if (claims.some((c) => c.status === "pending")) return "pending";
  if (claims.some((c) => c.status === "not_applicable")) return "not_applicable";
  if (claims.filter((c) => c.status === "approved").length >= quest.times_per_period) return "done";
  if (state.misses.some((m) => m.quest_id === quest.id && m.kid_id === kidId && m.period === period)) return "missed";
  if (claims.some((c) => c.status === "rejected")) return "rejected";
  return null;
}

function monthLabel(ym) {
  const d = new Date(ym + "-01T12:00:00Z");
  if (isNaN(d.getTime())) return ym;
  const s = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Instancias vencidas SIN resultado: quedan PENDIENTES DE REVISIÓN hasta que
// el adulto decida qué pasó (✅ 100% · 🟡 25% · ❌ -50% · 🚫 0). Cubre quests
// diarias, por días elegidos, semanales, mensuales y de una sola vez con
// fecha. Nunca se penalizan solas ni afectan rachas hasta la decisión.
export function pendingReviews(state) {
  const today = todayStr();
  const items = [];
  for (const quest of state.quests) {
    if (!quest.active) continue;
    const start = quest.created_date && quest.created_date < today ? quest.created_date : null;
    for (const kid of state.kids) {
      if (!assignedTo(quest, kid.id)) continue;
      const push = (period, dateStr, label) => {
        if (periodResult(state, quest, kid.id, period) !== null) return;
        items.push({
          id: quest.id + "|" + kid.id + "|" + period,
          quest_id: quest.id, kid_id: kid.id, kid_name: kid.name,
          title: quest.title, emoji: quest.emoji, points: quest.points,
          penalty: round1(quest.points / 2), period, date: dateStr || null, label,
        });
      };
      if (isDateInstance(quest)) {
        if (!start) continue;
        for (let d = start; d < today; d = addDaysStr(d, 1)) {
          if (dueOn(quest, d)) push("d:" + d, d, dateLabel(d));
        }
      } else if (quest.repeat === "weekly") {
        for (let w = mondayStr(start || today); w < mondayStr(today); w = addDaysStr(w, 7)) {
          push("w:" + w, w, "Semana del " + dateLabel(w));
        }
      } else if (quest.repeat === "monthly") {
        let ym = (start || today).slice(0, 7);
        const cur = today.slice(0, 7);
        while (ym < cur) {
          push("m:" + ym, null, monthLabel(ym));
          const [y, mo] = ym.split("-").map(Number);
          ym = mo === 12 ? y + 1 + "-01" : y + "-" + String(mo + 1).padStart(2, "0");
        }
      } else if (quest.repeat === "once") {
        if (quest.due_date && quest.due_date < today && !quest.completed_once)
          push("once", quest.due_date, dateLabel(quest.due_date));
      }
    }
  }
  return items.sort((a, b) => ((a.date || a.period) < (b.date || b.period) ? -1 : 1));
}

export function todayRows(state, dateStr) {
  return state.kids.map((kid) => ({ kid: pubKid(kid), quests: kidQuests(state, kid, dateStr) }));
}

export function yesterdayRows(state, dateStr) {
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
// Una instancia PENDING_REVIEW tampoco mueve nada: espera resolución.
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

export function applyStreaksOnDecision(state, kid, quest, decision, claim) {
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
export function breakDayStreaks(state, kid, quest) {
  for (const s of state.streaks) {
    if (!s.active || s.quest_id !== quest.id || s.type !== "days") continue;
    if (!streakAppliesTo(s, kid.id)) continue;
    const prog = getProg(state, s, kid.id);
    if (!prog.completed) { prog.count = 0; prog.last_day = null; }
  }
}

export function streaksForKid(state, kid) {
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
export function collectCelebrations(state, kid) {
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

export function pubStreak(state, s) {
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

export function validateStreak(state, body) {
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
export function removeStreak(state, streak) {
  state.streaks = state.streaks.filter((s) => s.id !== streak.id);
  Object.keys(state.streak_progress).forEach((k) => {
    if (k.startsWith(streak.id + "|")) delete state.streak_progress[k];
  });
}

// ---------------------------------------------------------------------------
// copias de seguridad del reinicio de progreso (vigencia: 30 días)
// ---------------------------------------------------------------------------

export function pruneBackups(state) {
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

export function listBackups(state) {
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
export function resetProgress(state) {
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

export function restoreBackup(state, id) {
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