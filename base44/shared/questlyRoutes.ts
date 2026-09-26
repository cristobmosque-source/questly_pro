// RUTAS DE LA API DE QUESTLY (servidor) — mismo comportamiento que la
// versión local. Autenticación propia de Questly: sesión por token, contraseña
// del adulto y PIN de los niños (ambos hasheados con SHA-256).

import {
  ApiError, sha256Hex,
  nowISO, todayStr, yesterdayStr, ymd, mondayStr, round1,
  periodFor, isDateInstance, dueOn, dateLabel, periodLabel,
  assignmentResult, assignmentState, buildOnceAssignments, syncOnceAssignments, assignedTo,
  pubKid, newId, addTxn, kidTxns, pubTxn, allTxns,
  kidQuests, dayItems, daySummary, pubReward, goalFor,
  claimsPending, redemptionsPending, pendingReviews, todayRows, yesterdayRows,
  applyStreaksOnDecision, breakDayStreaks, streaksForKid, collectCelebrations, pubStreak,
  validateStreak, removeStreak, pruneBackups, listBackups, resetProgress, restoreBackup,
  validateQuest, validateReward,
} from "./questlyDomain.ts";

// ---------------------------------------------------------------------------
// sesión
// ---------------------------------------------------------------------------

function current(state, token) {
  const s = (state.sessions || {})[token];
  if (!s) throw new ApiError("Tu sesión expiró. Entra de nuevo.", { status: 401 });
  return s;
}

function requireKid(state, token) {
  const s = current(state, token);
  if (s.role !== "kid") throw new ApiError("Esta sección es solo para niños.", { status: 403 });
  const kid = state.kids.find((k) => k.id === s.user_id);
  if (!kid) throw new ApiError("Tu perfil ya no existe.", { status: 401 });
  return kid;
}

function requireParent(state, token) {
  const s = current(state, token);
  if (s.role !== "parent") throw new ApiError("Esta sección es solo para adultos.", { status: 403 });
  return state.parent;
}

function login(state, user_id, role) {
  const token = role + "-" + user_id + "-" + Math.random().toString(36).slice(2, 10);
  state.sessions[token] = { user_id, role };
  return token;
}

// ---------------------------------------------------------------------------
// dispatcher de rutas
// ---------------------------------------------------------------------------

export async function handle(state, method, path, body, token) {
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

  // Primer arranque: crear la cuenta del adulto (solo si no existe ninguna).
  if (method === "POST" && path === "/setup") {
    if (state.parent) throw new ApiError("La familia ya está configurada. Entra con tu contraseña.");
    const name = String(body.name || "").trim();
    if (!name) throw new ApiError("Ponle tu nombre.");
    const password = String(body.password || "");
    if (password.length < 8) throw new ApiError("La contraseña debe tener al menos 8 caracteres.");
    if (password !== String(body.confirm || "")) throw new ApiError("Las contraseñas no coinciden.");
    state.parent = {
      id: "p1", name: name.slice(0, 40),
      avatar: String(body.avatar || "👨").slice(0, 4),
      email: String(body.email || "").slice(0, 80),
      password: await sha256Hex(password),
    };
    const t = login(state, state.parent.id, "parent");
    return { token: t, user: { id: state.parent.id, role: "parent", name: state.parent.name, avatar: state.parent.avatar } };
  }

  if (method === "POST" && path === "/auth/kid") {
    const kid = state.kids.find((k) => k.id === body.kid_id);
    if (!kid) throw new ApiError("Ese perfil ya no existe.", { status: 404 });
    if (kid.pin && await sha256Hex(String(body.pin || "")) !== kid.pin)
      throw new ApiError("PIN incorrecto. Inténtalo otra vez.");
    const t = login(state, kid.id, "kid");
    return { token: t, user: { id: kid.id, role: "kid", name: kid.name, avatar: kid.avatar, color: kid.color, points: kid.points } };
  }

  if (method === "POST" && path === "/auth/parent") {
    if (!state.parent || await sha256Hex(String(body.password || "")) !== state.parent.password)
      throw new ApiError("Contraseña incorrecta.");
    const t = login(state, state.parent.id, "parent");
    return { token: t, user: { id: state.parent.id, role: "parent", name: state.parent.name, avatar: state.parent.avatar } };
  }

  if (method === "GET" && path === "/me") {
    const s = current(state, token);
    if (s.role === "kid") {
      const kid = requireKid(state, token);
      return { user: { ...pubKid(kid), role: "kid" } };
    }
    return { user: { id: state.parent.id, role: "parent", name: state.parent.name, avatar: state.parent.avatar } };
  }

  // ----- niño --------------------------------------------------------------

  if (method === "GET" && path === "/kid/home") {
    const kid = requireKid(state, token);
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
    const kid = requireKid(state, token);
    const quest = state.quests.find((q) => q.id === m[1]);
    if (!quest || !quest.active) throw new ApiError("Esta quest ya no existe.");
    let period, assignment = null;
    if (quest.repeat === "once") {
      const own = state.assignments
        .filter((a) => a.quest_id === quest.id && a.kid_id === kid.id && assignmentResult(state, a) === null)
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      assignment = own.find((a) => a.id === body.assignment_id) || own[0];
      if (!assignment) throw new ApiError("Esta quest no toca hoy.");
      period = "a:" + assignment.id;
    } else {
      if (!assignedTo(quest, kid.id)) throw new ApiError("Esta quest no es tuya.");
      if (!dueOn(quest, tStr)) throw new ApiError("Esta quest no toca hoy.");
      period = periodFor(quest, tStr);
    }
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
    state.claims.push({
      id: newId(state), quest_id: quest.id, kid_id: kid.id, period,
      assignment_id: assignment ? assignment.id : null,
      date: isDateInstance(quest) ? tStr : null,
      status: "pending", completed_by: "kid", at: nowISO(),
    });
    return { kid: pubKid(kid), quests: kidQuests(state, kid, tStr), message: "¡Listo! Ahora queda esperando que un adulto la revise." };
  }

  if (method === "POST" && (m = path.match(/^\/kid\/quests\/([^/]+)\/retract$/))) {
    const kid = requireKid(state, token);
    const quest = state.quests.find((q) => q.id === m[1]);
    if (!quest) throw new ApiError("Esta quest ya no existe.", { status: 404 });
    let period;
    if (quest.repeat === "once") {
      const a = state.assignments.find((x) => x.id === body.assignment_id && x.quest_id === quest.id && x.kid_id === kid.id);
      if (!a) throw new ApiError("Esa asignación ya no existe.", { status: 404 });
      period = "a:" + a.id;
    } else {
      period = periodFor(quest, tStr);
    }
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
    const kid = requireKid(state, token);
    const quest = state.quests.find((q) => q.id === m[1]);
    if (!quest) throw new ApiError("Esta quest ya no existe.");
    const step = quest.subtasks.find((s) => s.id === m[2]);
    if (!step) throw new ApiError("Ese paso no existe.");
    let period;
    if (quest.repeat === "once") {
      const a = state.assignments.find((x) => x.id === body.assignment_id && x.quest_id === quest.id && x.kid_id === kid.id);
      if (!a) throw new ApiError("Esa asignación ya no existe.", { status: 404 });
      period = "a:" + a.id;
    } else {
      period = periodFor(quest, tStr);
    }
    const key = (t) => t.quest_id === quest.id && t.kid_id === kid.id && t.period === period && t.subtask_id === step.id;
    if (state.steps.some(key)) state.steps = state.steps.filter((t) => !key(t));
    else state.steps.push({ id: quest.id + "|" + kid.id + "|" + period + "|" + step.id, quest_id: quest.id, kid_id: kid.id, period, subtask_id: step.id });
    return { ok: true };
  }

  // ----- PIN del niño ------------------------------------------------------

  if (method === "POST" && path === "/kid/pin") {
    const kid = requireKid(state, token);
    if (kid.pin) throw new ApiError("Ya tienes un PIN. Si lo olvidaste, pide restablecerlo desde aquí.");
    const pin = String(body.pin || "").trim();
    if (!/^\d{4,6}$/.test(pin)) throw new ApiError("El PIN debe tener entre 4 y 6 dígitos.");
    if (pin !== String(body.confirm || "").trim()) throw new ApiError("Los PIN no coinciden. Inténtalo otra vez.");
    kid.pin = await sha256Hex(pin);
    return { message: "¡PIN creado! La próxima vez lo usarás para entrar." };
  }

  if (method === "POST" && path === "/kid/pin/forgot") {
    const kid = requireKid(state, token);
    const existing = state.pin_requests.find((r) => r.kid_id === kid.id && r.status === "pending");
    if (existing) return { message: "Ya hay una solicitud en camino. Un adulto la revisará pronto." };
    state.pin_requests.push({ id: newId(state), kid_id: kid.id, status: "pending", at: nowISO() });
    return { message: "Solicitud enviada. Un adulto te ayudará pronto." };
  }

  if (method === "GET" && path === "/kid/profile") {
    const kid = requireKid(state, token);
    const reqs = state.pin_requests
      .filter((r) => r.kid_id === kid.id)
      .sort((a, b) => (a.at < b.at ? 1 : -1));
    return {
      kid: pubKid(kid),
      pin_request: reqs.length ? { status: reqs[0].status, at: reqs[0].at } : null,
    };
  }

  if (method === "GET" && path === "/kid/shop") {
    const kid = requireKid(state, token);
    return {
      kid: pubKid(kid),
      rewards: state.rewards.filter((r) => r.active).map(pubReward),
      pending: state.redemptions.filter((r) => r.kid_id === kid.id && r.status === "pending")
        .map((r) => ({ id: r.id, emoji: r.emoji, title: r.title, at: r.at })),
      goal_id: kid.goal_id,
    };
  }

  if (method === "POST" && (m = path.match(/^\/kid\/shop\/([^/]+)\/buy$/))) {
    const kid = requireKid(state, token);
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
    const t = addTxn(state, kid, -reward.cost, "Canje: " + reward.title, "redeem", kid.name,
      { actor_name: kid.name, actor_role: "kid", source: "redeem" });
    state.redemptions.push({
      id: newId(state), reward_id: reward.id, kid_id: kid.id,
      title: reward.title, emoji: reward.emoji, cost: reward.cost,
      status: "pending", at: nowISO(), txn_id: t.id,
    });
    return { message: "¡Canjeada! Un adulto te la entregará pronto." };
  }

  if (method === "POST" && path === "/kid/goal/clear") {
    const kid = requireKid(state, token);
    kid.goal_id = null;
    return { message: "Meta quitada." };
  }

  if (method === "POST" && (m = path.match(/^\/kid\/goal\/([^/]+)$/))) {
    const kid = requireKid(state, token);
    const reward = state.rewards.find((r) => r.id === m[1] && r.active);
    if (!reward) throw new ApiError("Esa recompensa ya no existe.");
    kid.goal_id = reward.id;
    return { message: "¡Nueva meta! ¡A por ella!" };
  }

  if (method === "GET" && path === "/kid/history") {
    const kid = requireKid(state, token);
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
    requireParent(state, token);
    const pinPending = state.pin_requests.filter((r) => r.status === "pending").length;
    return { pending: claimsPending(state).length + redemptionsPending(state).length + pendingReviews(state).length + pinPending };
  }

  if (method === "GET" && path === "/parent/dashboard") {
    requireParent(state, token);
    const activity = state.txns
      .slice().sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 200)
      .map((t) => pubTxn(state, t));
    return {
      kids: state.kids.map((k) => ({
        ...pubKid(k),
        yesterday: daySummary(state, k, yStr, true),
        today: daySummary(state, k, tStr, false),
      })),
      claims: claimsPending(state),
      redemptions: redemptionsPending(state),
      reviews: pendingReviews(state),
      pin_requests: state.pin_requests
        .filter((r) => r.status === "pending")
        .map((r) => ({ kid_name: (state.kids.find((k) => k.id === r.kid_id) || {}).name || "—", at: r.at })),
      pending: claimsPending(state).length + redemptionsPending(state).length + pendingReviews(state).length,
      today_date: tStr,
      yesterday_date: yStr,
      activity,
    };
  }

  if (method === "GET" && path === "/parent/today") {
    requireParent(state, token);
    return {
      today_date: tStr,
      yesterday_date: yStr,
      rows: todayRows(state, tStr),
      yesterday_rows: yesterdayRows(state, yStr),
    };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/quests\/([^/]+)\/missed\/([^/]+)$/))) {
    const parent = requireParent(state, token);
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
      "missed", parent.name,
      { actor_name: parent.name, actor_role: "parent", source: "missed" });
    mt.origin = "parent"; mt.origin_name = parent.name;
    breakDayStreaks(state, kid, quest);
    return {
      rows: todayRows(state, tStr),
      yesterday_rows: yesterdayRows(state, yStr),
      message: "Se descontaron " + penalty + " puntos a " + kid.name +
        ". La instancia del " + dateLabel(dateStr) + " quedó cerrada.",
    };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/quests\/([^/]+)\/instances\/([^/]+)\/resolve$/))) {
    const parent = requireParent(state, token);
    const quest = state.quests.find((q) => q.id === m[1]);
    const kid = state.kids.find((k) => k.id === m[2]);
    if (!quest || !kid) throw new ApiError("Esa quest o ese niño ya no existen.", { status: 404 });
    const result = ["full", "partial", "not_done", "not_applicable"].includes(body.result) ? body.result : null;
    if (!result) throw new ApiError("Resultado no válido.");
    let period, dateStr = null;
    if (isDateInstance(quest)) {
      dateStr = body.date && /^\d{4}-\d{2}-\d{2}$/.test(String(body.date)) ? String(body.date) : tStr;
      if (dateStr > tStr) throw new ApiError("No puedes registrar días que aún no llegan.");
      if (!dueOn(quest, dateStr))
        throw new ApiError("Esta quest no corresponde al " + dateLabel(dateStr) + ".");
      period = periodFor(quest, dateStr);
    } else if (quest.repeat === "once") {
      const p = String(body.period || "");
      const a = p.startsWith("a:") ? state.assignments.find((x) => x.id === p.slice(2)) : null;
      if (!a || a.quest_id !== quest.id) throw new ApiError("Esa asignación ya no existe.", { status: 404 });
      if (a.kid_id !== kid.id) throw new ApiError("Esta asignación no corresponde a este niño.");
      if (assignmentResult(state, a) !== null) throw new ApiError("Esta asignación ya está resuelta.");
      dateStr = a.due_date;
      period = p;
    } else if (quest.repeat === "weekly") {
      period = String(body.period || "");
      if (!/^w:\d{4}-\d{2}-\d{2}$/.test(period) || period.slice(2) >= mondayStr(tStr))
        throw new ApiError("Período no válido: elige una semana ya terminada.");
      dateStr = period.slice(2);
    } else if (quest.repeat === "monthly") {
      period = String(body.period || "");
      if (!/^m:\d{4}-\d{2}$/.test(period) || period.slice(2) >= tStr.slice(0, 7))
        throw new ApiError("Período no válido: elige un mes ya terminado.");
    } else {
      throw new ApiError("Esta quest no se resuelve por instancia.");
    }
    if (quest.repeat !== "once" && !assignedTo(quest, kid.id))
      throw new ApiError("Esta quest no corresponde a este niño.");
    const claims = state.claims.filter((c) => c.quest_id === quest.id && c.kid_id === kid.id && c.period === period);
    if (claims.some((c) => c.status === "pending"))
      throw new ApiError("Hay una revisión pendiente de esta quest; decídela primero.");
    if (claims.filter((c) => c.status === "approved").length >= quest.times_per_period)
      throw new ApiError("Esta quest ya quedó registrada como hecha en ese período.");
    if (claims.some((c) => c.status === "not_applicable"))
      throw new ApiError("Esta quest ya quedó como no aplica en ese período.");
    if (state.misses.some((x) => x.quest_id === quest.id && x.kid_id === kid.id && x.period === period))
      throw new ApiError("Esta quest ya está marcada como no realizada en ese período.");
    const comment = String(body.comment || "").trim().slice(0, 140) || null;
    const source = "pending_review";
    const periodTxt = dateStr ? dateLabel(dateStr) : "ese período";
    let message;
    if (result === "not_applicable") {
      state.claims.push({
        id: newId(state), quest_id: quest.id, kid_id: kid.id, period, date: dateStr,
        status: "not_applicable", decision: "not_applicable", completed_by: "parent",
        comment, source, at: nowISO(), decided_at: nowISO(),
      });
      message = "🚫 No aplica: '" + quest.title + "' del " + periodTxt +
        " quedó cerrada sin puntos ni penalización.";
    } else if (result === "not_done") {
      const penalty = round1(quest.points / 2);
      state.misses.push({ id: newId(state), quest_id: quest.id, kid_id: kid.id, period, penalty, comment, source, at: nowISO() });
      const t = addTxn(state, kid, -penalty,
        "'" + quest.title + "' no realizada (" + periodTxt + ")", "missed", parent.name,
        { actor_name: parent.name, actor_role: "parent", source: "review" });
      t.origin = "parent"; t.origin_name = parent.name;
      breakDayStreaks(state, kid, quest);
      message = "❌ No realizada: se descontaron " + penalty + " puntos a " + kid.name + " (50%).";
    } else {
      const full = result === "full";
      const awarded = full ? quest.points : round1(quest.points * 0.25);
      const claim = {
        id: newId(state), quest_id: quest.id, kid_id: kid.id, period, date: dateStr,
        status: "approved", decision: full ? "approve" : "partial", awarded,
        completed_by: "parent", comment, source, at: nowISO(), decided_at: nowISO(),
      };
      state.claims.push(claim);
      const t = addTxn(state, kid, awarded,
        quest.title + (full ? "" : " (hecha a medias)"),
        full ? "quest" : "partial", parent.name,
        { actor_name: parent.name, actor_role: "parent", source: "review" });
      t.origin = "parent"; t.origin_name = parent.name;
      message = (full ? "✅ Hecha correctamente: " : "🟡 Hecha a medias: ") + kid.name +
        " ganó " + awarded + " puntos — registrada por " + parent.name + ".";
      const awards = applyStreaksOnDecision(state, kid, quest, full ? "approve" : "partial", claim, parent.name);
      awards.forEach((s) => {
        message += " 🔥 ¡Racha completada: " + s.name + "! +" + s.reward_points + " puntos para " + kid.name + ".";
      });
    }
    return { message };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/quests\/([^/]+)\/reassign$/))) {
    const parent = requireParent(state, token);
    const quest = state.quests.find((q) => q.id === m[1]);
    if (!quest) throw new ApiError("Esa quest ya no existe.", { status: 404 });
    if (quest.repeat !== "once")
      throw new ApiError("Solo las quests de una sola vez se asignan por fecha.");
    const kid = state.kids.find((k) => k.id === body.kid_id);
    if (!kid) throw new ApiError("Elige a qué niño asignarla.", { status: 404 });
    const due_date = body.due_date && /^\d{4}-\d{2}-\d{2}$/.test(String(body.due_date))
      ? String(body.due_date) : (quest.due_date || null);
    state.assignments.push({
      id: newId(state), quest_id: quest.id, kid_id: kid.id,
      due_date, created_at: nowISO(), created_by: parent.name,
    });
    return {
      message: "Nueva asignación de '" + quest.title + "' para " + kid.name +
        (due_date ? " (" + dateLabel(due_date) + ")" : "") +
        ". Es la misma quest: el catálogo y el historial no cambian.",
    };
  }

  if (method === "GET" && path === "/parent/quests") {
    requireParent(state, token);
    return { quests: state.quests, kids: state.kids.map(pubKid) };
  }

  if (method === "POST" && path === "/parent/quests") {
    requireParent(state, token);
    const data = validateQuest(state, body);
    const quest = { id: newId(state), active: true, created_date: tStr, ...data };
    state.quests.push(quest);
    if (quest.repeat === "once") syncOnceAssignments(state, quest, data);
    return { quests: state.quests, message: "Quest creada." };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/quests\/([^/]+)$/))) {
    requireParent(state, token);
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
      state.assignments = state.assignments.filter((a) => a.quest_id !== quest.id);
      state.streaks.filter((s) => s.quest_id === quest.id).forEach(removeStreak.bind(null, state));
      return { quests: state.quests, message: "Quest eliminada." };
    }
    const data = validateQuest(state, body);
    Object.assign(quest, data);
    if (quest.repeat === "once") syncOnceAssignments(state, quest, data);
    return { quests: state.quests, message: "Quest actualizada." };
  }

  // ----- historial de auditoría (adulto) -------------------------------------

  if (method === "GET" && path === "/parent/history") {
    requireParent(state, token);
    return {
      kids: state.kids.map(pubKid),
      parent_name: state.parent.name,
      txns: allTxns(state),
    };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/txns\/([^/]+)\/reverse$/))) {
    const parent = requireParent(state, token);
    const t = state.txns.find((x) => x.id === m[1]);
    if (!t) throw new ApiError("Ese movimiento ya no existe.", { status: 404 });
    if (t.reversal_of) throw new ApiError("Una reversión no se puede volver a revertir.");
    if (t.status === "reversed") throw new ApiError("Este movimiento ya fue revertido.");
    const kid = state.kids.find((k) => k.id === t.kid_id);
    if (!kid) throw new ApiError("El niño de este movimiento ya no existe.", { status: 404 });
    let extra = "";
    if (t.kind === "redeem") {
      const rd = state.redemptions.find((r) => r.txn_id === t.id) ||
        state.redemptions.find((r) => r.kid_id === t.kid_id && t.reason === "Canje: " + r.title);
      if (rd && rd.status !== "reverted") {
        rd.status = "reverted";
        rd.decided_at = nowISO();
        const reward = state.rewards.find((r) => r.id === rd.reward_id);
        if (reward && reward.stock_mode === "fixed") {
          reward.stock += 1;
          extra = " El canje quedó revertido y el stock de la recompensa fue repuesto.";
        } else {
          extra = " El canje quedó revertido.";
        }
      }
    }
    const r = addTxn(state, kid, -t.delta, t.reason + " — Reversión", "reversal", parent.name,
      { actor_name: parent.name, actor_role: "parent", source: "reversal" });
    r.reversal_of = t.id;
    t.status = "reversed";
    t.reversed_at = nowISO();
    t.reversed_by = parent.name;
    t.reversal_txn_id = r.id;
    return {
      message: "Movimiento revertido: se " + (t.delta > 0 ? "quitaron" : "devolvieron") +
        " " + Math.abs(t.delta) + " puntos a " + kid.name + "." + extra,
      txns: allTxns(state),
    };
  }

  if (method === "GET" && path === "/parent/approvals") {
    requireParent(state, token);
    return {
      claims: claimsPending(state),
      redemptions: redemptionsPending(state),
      reviews: pendingReviews(state),
      pin_pending: state.pin_requests.filter((r) => r.status === "pending").length,
    };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/claims\/([^/]+)$/))) {
    const parent = requireParent(state, token);
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
        const t = addTxn(state, kid, quest.points, quest.title, "quest", parent.name,
          { actor_name: parent.name, actor_role: "parent", source: "claim" });
        t.origin = claim.completed_by || "kid";
        t.origin_name = claim.completed_by === "parent" ? parent.name : kid.name;
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
        const t = addTxn(state, kid, awarded, quest.title + " (hecha a medias)", "partial", parent.name,
          { actor_name: parent.name, actor_role: "parent", source: "claim" });
        t.origin = claim.completed_by || "kid";
        t.origin_name = claim.completed_by === "parent" ? parent.name : kid.name;
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
        const t = addTxn(state, kid, -penalty, "'" + quest.title + "' no realizada (dijo que la hizo)", "missed", parent.name,
          { actor_name: parent.name, actor_role: "parent", source: "claim" });
        t.origin = "parent"; t.origin_name = parent.name;
      }
      message = "❌ No realizada: se descontaron " + penalty + " puntos a " +
        (kid ? kid.name : "el niño") + " (50%).";
    } else if (body.decision === "not_applicable") {
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
    if (quest && kid) {
      const awards = applyStreaksOnDecision(state, kid, quest, body.decision, claim, parent.name);
      awards.forEach((s) => {
        message += " 🔥 ¡Racha completada: " + s.name + "! +" + s.reward_points + " puntos para " + kid.name + ".";
      });
    }
    return { claims: claimsPending(state), redemptions: redemptionsPending(state), message };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/redemptions\/([^/]+)$/))) {
    const parent = requireParent(state, token);
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
      if (kid) addTxn(state, kid, redemption.cost, "Reembolso: " + redemption.title, "refund", parent.name,
        { actor_name: parent.name, actor_role: "parent", source: "refund" });
      if (reward && reward.stock_mode === "fixed") reward.stock += 1;
      message = "Rechazada — los puntos vuelven a " + (kid ? kid.name : "el niño") + ".";
    }
    return { claims: claimsPending(state), redemptions: redemptionsPending(state), message };
  }

  // ----- rachas (adulto) ----------------------------------------------------

  if (method === "GET" && path === "/parent/streaks") {
    requireParent(state, token);
    return { streaks: state.streaks.map((s) => pubStreak(state, s)) };
  }

  if (method === "POST" && path === "/parent/streaks") {
    requireParent(state, token);
    const data = validateStreak(state, body);
    state.streaks.push({ id: newId(state), active: body.active === undefined ? true : !!body.active, ...data });
    return { streaks: state.streaks.map((s) => pubStreak(state, s)), message: "Racha creada." };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/streaks\/([^/]+)$/))) {
    requireParent(state, token);
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

  // ----- copias de seguridad y reinicio de progreso --------------------------

  if (method === "GET" && path === "/parent/backups") {
    requireParent(state, token);
    return { backups: listBackups(state) };
  }

  if (method === "POST" && path === "/parent/progress/reset") {
    requireParent(state, token);
    return resetProgress(state);
  }

  if (method === "POST" && (m = path.match(/^\/parent\/backups\/([^/]+)\/restore$/))) {
    requireParent(state, token);
    return restoreBackup(state, m[1]);
  }

  // ----- PIN (adulto): solicitudes de los niños -------------------------------

  if (method === "GET" && path === "/parent/pin-requests") {
    requireParent(state, token);
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
    requireParent(state, token);
    const req = state.pin_requests.find((r) => r.id === m[1]);
    if (!req) throw new ApiError("Esa solicitud ya no existe.", { status: 404 });
    if (req.status !== "pending") throw new ApiError("Esa solicitud ya fue revisada.");
    const kid = state.kids.find((k) => k.id === req.kid_id);
    if (body.action === "reject") {
      req.status = "rejected";
      req.decided_at = nowISO();
      return { message: "Solicitud rechazada." };
    }
    const pin = String(body.pin || "").trim();
    if (pin && !/^\d{4,6}$/.test(pin)) throw new ApiError("El PIN debe tener entre 4 y 6 dígitos.");
    req.status = "approved";
    req.decided_at = nowISO();
    let message = "Solicitud aprobada.";
    if (kid) {
      kid.pin = pin ? await sha256Hex(pin) : null;
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
    requireParent(state, token);
    return { rewards: state.rewards };
  }

  if (method === "POST" && path === "/parent/rewards") {
    requireParent(state, token);
    state.rewards.push({ id: newId(state), active: true, ...validateReward(body) });
    return { rewards: state.rewards, message: "Recompensa creada." };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/rewards\/([^/]+)$/))) {
    requireParent(state, token);
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
    requireParent(state, token);
    return { kids: state.kids.map(pubKid), parents: [{ name: state.parent.name }] };
  }

  if (method === "POST" && path === "/parent/kids") {
    requireParent(state, token);
    const name = String(body.name || "").trim();
    if (!name) throw new ApiError("Ponle un nombre.");
    const pin = String(body.pin || "").trim();
    if (pin && !/^\d{4,6}$/.test(pin)) throw new ApiError("El PIN debe tener entre 4 y 6 dígitos.");
    const points = Math.max(0, Math.min(100000, Number(body.points) || 0));
    const kid = {
      id: newId(state), name: name.slice(0, 40),
      avatar: String(body.avatar || "🦊").slice(0, 4),
      color: /^#[0-9a-fA-F]{6}$/.test(body.color || "") ? body.color : "#7c4dff",
      pin: pin ? await sha256Hex(pin) : null, points, lifetime_points: points, goal_id: null,
    };
    state.kids.push(kid);
    return { kids: state.kids.map(pubKid), message: "¡" + kid.name + " se unió a la familia!" };
  }

  if (method === "GET" && (m = path.match(/^\/parent\/kids\/([^/]+)$/))) {
    requireParent(state, token);
    const kid = state.kids.find((k) => k.id === m[1]);
    if (!kid) throw new ApiError("Ese niño ya no existe.", { status: 404 });
    return {
      kid: pubKid(kid),
      today_date: tStr,
      yesterday_date: yStr,
      yesterday: { date: yStr, items: dayItems(state, kid, yStr) },
      today: { date: tStr, quests: kidQuests(state, kid, tStr) },
      history: kidTxns(state, kid.id).map((t) => pubTxn(state, t)),
      redemptions: state.redemptions.filter((r) => r.kid_id === kid.id)
        .map((r) => ({ id: r.id, emoji: r.emoji, title: r.title, cost: r.cost, at: r.at, status: r.status }))
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    };
  }

  if (method === "POST" && (m = path.match(/^\/parent\/kids\/([^/]+)$/))) {
    requireParent(state, token);
    const kid = state.kids.find((k) => k.id === m[1]);
    if (!kid) throw new ApiError("Ese niño ya no existe.", { status: 404 });
    if (body.action === "delete") {
      state.kids = state.kids.filter((k) => k.id !== kid.id);
      state.claims = state.claims.filter((c) => c.kid_id !== kid.id);
      state.misses = state.misses.filter((x) => x.kid_id !== kid.id);
      state.steps = state.steps.filter((t) => t.kid_id !== kid.id);
      state.assignments = state.assignments.filter((a) => a.kid_id !== kid.id);
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
      kid.pin = pin ? await sha256Hex(pin) : null;
    }
    return { kids: state.kids.map(pubKid), message: "Datos actualizados." };
  }

  if (method === "POST" && path === "/parent/award") {
    const parent = requireParent(state, token);
    const kid = state.kids.find((k) => k.id === body.kid_id);
    if (!kid) throw new ApiError("Ese niño ya no existe.", { status: 404 });
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000)
      throw new ApiError("La cantidad debe estar entre 1 y 100000 puntos.");
    const negate = !!body.negate;
    const reason = String(body.reason || "").trim() ||
      (negate ? "Puntos quitados por un adulto" : "Puntos de regalo");
    addTxn(state, kid, negate ? -amount : amount, reason, negate ? "deduct" : "award", parent.name,
      { actor_name: parent.name, actor_role: "parent", source: "manual" });
    return {
      message: "Se le " + (negate ? "quitaron" : "dieron") + " " + amount + " puntos a " + kid.name + ".",
    };
  }

  throw new ApiError("Ruta no encontrada: " + method + " " + path, { status: 404 });
}