"""JSON API for the Questly frontend.

A thin transport layer over `models.py`: every endpoint below calls the same
functions the server-rendered views use, so quests, claims, points, rewards,
approvals and missed penalties behave exactly as they always have.

Authentication is token-based so a separate frontend origin can call in:
`Authorization: Bearer <token>`. Tokens are stored on the user's document and
issued by the /auth endpoints. The session-cookie flow used by the Jinja
templates keeps working unchanged.
"""

import secrets
from functools import wraps

from flask import Blueprint, g, jsonify, request

from ..db import get_db
from ..models import (REPEAT_CHOICES, STOCK_PERIODS, STOCK_SCOPES,
                      adjust_points, annotate_rewards, claim_quest,
                      create_kid, create_parent, decide_quest_claim,
                      decide_redemption, get_quest, get_reward, get_user,
                      goal_for, has_any_parent, history_for, list_kids,
                      list_parents, list_quests, list_rewards,
                      mark_quest_missed, oid, parse_subtasks, period_key,
                      pending_claims, pending_count, pending_redemptions,
                      quests_for_kid, recent_activity, redeem,
                      redemptions_for, set_kid_goal, stock_label, stock_mode,
                      toggle_subtask, verify_kid_pin, verify_parent)
from ..notify import compose, notify, notify_many
from .helpers import as_int, check_goal_reached, local_now

bp = Blueprint("api", __name__, url_prefix="/api/v1")


@bp.after_request
def api_cors(response):
    """The frontend may live on another origin; allow it to call in."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    return response


def ok(**data):
    return jsonify(ok=True, **data)


def fail(msg, status=400):
    return jsonify(ok=False, error=msg), status


# ---------------------------------------------------------------------------
# serializers
# ---------------------------------------------------------------------------

def kid_brief(kid):
    return {"id": str(kid["_id"]), "name": kid["name"],
            "avatar": kid.get("avatar"), "color": kid.get("color"),
            "points": kid.get("points", 0)}


def kid_me(kid):
    out = kid_brief(kid)
    out["lifetime_points"] = kid.get("lifetime_points", 0)
    out["role"] = "kid"
    return out


def parent_me(parent):
    return {"id": str(parent["_id"]), "name": parent["name"],
            "avatar": parent.get("avatar"), "role": "parent"}


def quest_for_kid(q):
    ticked = q.get("ticked") or set()
    subtasks = [{"id": t["id"], "text": t["text"], "done": t["id"] in ticked}
                for t in q.get("subtasks") or []]
    return {
        "id": str(q["_id"]), "title": q["title"], "emoji": q.get("emoji", "⭐"),
        "points": q["points"], "repeat": q.get("repeat", "daily"),
        "repeat_days": q.get("repeat_days") or [],
        "description": q.get("description", ""),
        "subtasks": subtasks,
        "steps_done": q.get("steps_done", 0),
        "steps_total": q.get("steps_total", 0),
        "state": q["state"], "used": q.get("used", 0),
        "limit": q.get("limit", 1), "done_count": q.get("done_count", 0),
        "pending_count": q.get("pending_count", 0),
        "missed": bool(q.get("missed")),
    }


def quest_admin(q):
    return {
        "id": str(q["_id"]), "title": q["title"], "emoji": q.get("emoji", "⭐"),
        "points": q["points"], "repeat": q.get("repeat", "daily"),
        "repeat_days": q.get("repeat_days") or [],
        "description": q.get("description", ""),
        "subtasks": q.get("subtasks") or [],
        "times_per_period": q.get("times_per_period", 1),
        "assigned_to": [str(a) for a in q.get("assigned_to") or []],
        "active": q.get("active", True),
    }


def reward_ser(r, admin=False):
    out = {
        "id": str(r["_id"]), "title": r["title"], "emoji": r.get("emoji", "🎁"),
        "description": r.get("description", ""), "cost": r["cost"],
        "left": r.get("left"), "stock_text": r.get("stock_text"),
        "sold_out": bool(r.get("sold_out")),
    }
    if admin:
        out.update({
            "active": r.get("active", True), "stock": r.get("stock"),
            "stock_mode": stock_mode(r), "stock_limit": r.get("stock_limit"),
            "stock_period": r.get("stock_period") or "daily",
            "stock_scope": r.get("stock_scope") or "child",
        })
    return out


def history_entry(h):
    return {"id": str(h["_id"]), "delta": h["delta"],
            "reason": h.get("reason", ""), "kind": h.get("kind", ""),
            "actor": h.get("actor_name", ""),
            "balance_after": h.get("balance_after"),
            "at": h["created_at"].isoformat()}


def claim_ser(c):
    return {"id": str(c["_id"]), "kid_id": str(c["kid_id"]),
            "kid_name": c["kid_name"], "kid_avatar": c.get("kid_avatar"),
            "quest_id": str(c["quest_id"]), "title": c["quest_title"],
            "emoji": c.get("quest_emoji", "✅"), "points": c["points"],
            "status": c["status"], "at": c["created_at"].isoformat()}


def redemption_ser(r):
    return {"id": str(r["_id"]), "kid_id": str(r["kid_id"]),
            "kid_name": r["kid_name"], "kid_avatar": r.get("kid_avatar"),
            "reward_id": str(r["reward_id"]), "title": r["reward_title"],
            "emoji": r.get("reward_emoji", "🎁"), "cost": r["cost"],
            "status": r["status"], "at": r["created_at"].isoformat()}


# ---------------------------------------------------------------------------
# auth
# ---------------------------------------------------------------------------

def _token_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    return get_db().users.find_one({"api_token": header[7:].strip()})


def require_role(role):
    def deco(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = _token_user()
            if not user:
                return fail("Inicia sesión primero.", 401)
            if user.get("role") != role:
                return fail("Eso no es para ti.", 403)
            g.user = user
            return view(*args, **kwargs)
        return wrapped
    return deco


def _issue_token(db, user):
    token = secrets.token_urlsafe(32)
    db.users.update_one({"_id": user["_id"]}, {"$set": {"api_token": token}})
    return token


@bp.get("/bootstrap")
def bootstrap():
    """Public: who can sign in on the entry screen."""
    db = get_db()
    kids = [{"id": str(k["_id"]), "name": k["name"], "avatar": k.get("avatar"),
             "color": k.get("color"), "has_pin": bool(k.get("pin_hash"))}
            for k in list_kids(db)]
    return jsonify(ok=True, has_parent=has_any_parent(db), kids=kids)


@bp.post("/setup")
def setup():
    """First run: create the first grown-up account (mirrors auth.setup)."""
    db = get_db()
    if has_any_parent(db):
        return fail("Ya existe una cuenta de adulto.", 409)
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""

    if not name or not email or not password:
        return fail("Completa todos los campos.")
    if "@" not in email:
        return fail("Eso no parece un correo electrónico.")
    if len(password) < 8:
        return fail("Usa una contraseña de al menos 8 caracteres.")
    if password != (data.get("confirm") or ""):
        return fail("Las dos contraseñas no coinciden.")

    uid = create_parent(db, name, email, password)
    user = get_user(db, uid)
    return ok(token=_issue_token(db, user), user=parent_me(user))


@bp.post("/auth/parent")
def parent_login():
    db = get_db()
    data = request.get_json(silent=True) or {}
    user = verify_parent(db, data.get("email") or "", data.get("password") or "")
    if not user:
        return fail("Correo o contraseña incorrectos.", 401)
    return ok(token=_issue_token(db, user), user=parent_me(user))


@bp.post("/auth/kid")
def kid_login():
    db = get_db()
    data = request.get_json(silent=True) or {}
    kid = get_user(db, data.get("kid_id") or "")
    if not kid or kid["role"] != "kid":
        return fail("No encontramos a ese niño.", 404)
    if not verify_kid_pin(kid, data.get("pin") or ""):
        return fail("Ese PIN no era — ¡inténtalo de nuevo!", 401)
    return ok(token=_issue_token(db, kid), user=kid_me(kid))


@bp.post("/auth/logout")
def logout():
    user = _token_user()
    if user:
        get_db().users.update_one({"_id": user["_id"]},
                                  {"$set": {"api_token": None}})
    return ok()


@bp.get("/me")
def me():
    user = _token_user()
    if not user:
        return fail("Inicia sesión primero.", 401)
    return ok(user=kid_me(user) if user["role"] == "kid" else parent_me(user))


# ---------------------------------------------------------------------------
# kid
# ---------------------------------------------------------------------------

@bp.get("/kid/home")
@require_role("kid")
def kid_home():
    db = get_db()
    kid, now = g.user, local_now()
    quests = quests_for_kid(db, kid, now)
    rewards = annotate_rewards(db, list_rewards(db), kid, now)
    goal, chosen = goal_for(db, kid, rewards)
    balance = kid.get("points", 0)
    return ok(
        kid=kid_me(kid),
        quests=[quest_for_kid(q) for q in quests],
        goal=reward_ser(goal) if goal else None,
        goal_chosen=chosen,
        goal_reached=bool(goal and balance >= goal["cost"]),
        affordable=[reward_ser(r) for r in rewards
                    if r["cost"] <= balance and not r["sold_out"]],
        history=[history_entry(h) for h in history_for(db, kid["_id"], limit=8)],
    )


@bp.post("/kid/quests/<quest_id>/claim")
@require_role("kid")
def kid_claim(quest_id):
    """Mark a quest as done (mirrors kid.finish_quest)."""
    db = get_db()
    kid = g.user
    quest = get_quest(db, quest_id)
    if not quest or not quest.get("active"):
        return fail("Esa quest ya no está.", 404)
    if quest.get("assigned_to") and kid["_id"] not in quest["assigned_to"]:
        return fail("Esa quest no es tuya.", 403)

    claim, error = claim_quest(db, quest, kid, local_now())
    if error:
        return fail(error)
    notify_many(db, list_parents(db), "approval_waiting",
                f"{quest.get('emoji', '')} {kid['name']} terminó {quest['title']}".strip(),
                compose(f"Quest: {quest['title']} ({quest.get('repeat', 'daily')})",
                        f"Vale {quest['points']} puntos",
                        f"{kid['name']} tiene {kid.get('points', 0)} puntos ahora",
                        "Apruébala en Questly para pagarlo."))
    kid = get_user(db, kid["_id"])
    return ok(message=f"¡Muy bien! {quest['points']} puntos en camino en cuanto lo revisen.",
              kid=kid_me(kid),
              quests=[quest_for_kid(q) for q in quests_for_kid(db, kid, local_now())])


@bp.post("/kid/quests/<quest_id>/step/<subtask_id>")
@require_role("kid")
def kid_step(quest_id, subtask_id):
    """Tick or untick one subtask (mirrors kid.tick_step)."""
    db = get_db()
    kid = g.user
    quest = get_quest(db, quest_id)
    if not quest or not quest.get("active"):
        return fail("Esa quest ya no está.", 404)
    if quest.get("assigned_to") and kid["_id"] not in quest["assigned_to"]:
        return fail("Esa quest no es tuya.", 403)
    key = period_key(quest.get("repeat", "daily"), local_now())
    ticked = toggle_subtask(db, quest, kid, key, subtask_id)
    return ok(ticked=sorted(ticked), steps_done=len(ticked),
              steps_total=len(quest.get("subtasks") or []))


@bp.get("/kid/shop")
@require_role("kid")
def kid_shop():
    db = get_db()
    kid = g.user
    rewards = annotate_rewards(db, list_rewards(db), kid, local_now())
    return ok(
        kid=kid_me(kid),
        rewards=[reward_ser(r) for r in rewards],
        goal_id=kid.get("goal_reward_id") and str(kid["goal_reward_id"]),
        pending=[redemption_ser(r)
                 for r in redemptions_for(db, kid["_id"], limit=20)
                 if r["status"] == "pending"],
    )


@bp.post("/kid/shop/<reward_id>/buy")
@require_role("kid")
def kid_buy(reward_id):
    """Redeem a reward (mirrors kid.buy)."""
    db = get_db()
    kid = g.user
    reward = get_reward(db, reward_id)
    if not reward or not reward.get("active"):
        return fail("Esa recompensa no está disponible.", 404)
    _, error = redeem(db, kid, reward, local_now())
    if error:
        return fail(error)
    kid = get_user(db, kid["_id"])
    notify_many(db, list_parents(db), "approval_waiting",
                f"{reward.get('emoji', '')} {kid['name']} compró {reward['title']}".strip(),
                compose(f"Cuesta {reward['cost']} puntos",
                        f"A {kid['name']} le quedan {kid.get('points', 0)} puntos",
                        reward.get("description"),
                        "Entrégala y márcala como entregada en Questly."))
    return ok(message=f"¡Conseguiste {reward['title']}! Pide a un adulto que te la entregue.",
              kid=kid_me(kid))


@bp.post("/kid/goal/<reward_id>")
@require_role("kid")
def kid_goal(reward_id):
    db = get_db()
    if reward_id == "clear":
        set_kid_goal(db, g.user["_id"], None)
        return ok(message="De vuelta al objetivo automático.")
    reward = get_reward(db, reward_id)
    if not reward or not reward.get("active"):
        return fail("Esa recompensa no está disponible.", 404)
    set_kid_goal(db, g.user["_id"], reward["_id"])
    return ok(message=f"¡Ahorrando para {reward['emoji']} {reward['title']}!")


@bp.get("/kid/history")
@require_role("kid")
def kid_history():
    db = get_db()
    kid = g.user
    return ok(
        kid=kid_me(kid),
        history=[history_entry(h) for h in history_for(db, kid["_id"], limit=100)],
        redemptions=[redemption_ser(r)
                     for r in redemptions_for(db, kid["_id"], limit=50)],
    )


# ---------------------------------------------------------------------------
# parent
# ---------------------------------------------------------------------------

def _penalty(points):
    half = int(points) / 2
    return int(half) if half == int(half) else half


def _today_rows(db):
    now = local_now()
    rows = []
    for kid in list_kids(db):
        quests = [q for q in quests_for_kid(db, kid, now)
                  if q["repeat"] in ("daily", "custom_days")]
        rows.append({
            "kid": kid_brief(kid),
            "quests": [dict(quest_for_kid(q), penalty=_penalty(q["points"]))
                       for q in quests],
        })
    return rows


@bp.get("/parent/dashboard")
@require_role("parent")
def parent_dashboard():
    db = get_db()
    kids = [dict(kid_brief(k), lifetime_points=k.get("lifetime_points", 0))
            for k in list_kids(db)]
    claims = [claim_ser(c) for c in pending_claims(db)]
    redemptions = [redemption_ser(r) for r in pending_redemptions(db)]
    return ok(
        kids=kids,
        activity=[history_entry(h) for h in recent_activity(db, limit=15)],
        claims=claims, redemptions=redemptions,
        today=_today_rows(db),
        pending=len(claims) + len(redemptions),
    )


@bp.get("/parent/badge")
@require_role("parent")
def parent_badge():
    return ok(pending=pending_count(get_db()))


@bp.get("/parent/today")
@require_role("parent")
def parent_today():
    return ok(rows=_today_rows(get_db()))


@bp.post("/parent/quests/<quest_id>/missed/<kid_id>")
@require_role("parent")
def parent_mark_missed(quest_id, kid_id):
    db = get_db()
    quest = get_quest(db, quest_id)
    kid = get_user(db, kid_id)
    if not quest or not kid or kid.get("role") != "kid":
        return fail("No encontramos esa quest o ese niño.", 404)
    claim, error = mark_quest_missed(db, quest, kid, local_now(), g.user)
    if error:
        return fail(error)
    return ok(
        message=f"'{quest['title']}' marcada como no realizada para {kid['name']} "
                f"— se descontaron {claim['penalty']} puntos.",
        rows=_today_rows(db))


@bp.get("/parent/approvals")
@require_role("parent")
def parent_approvals():
    db = get_db()
    return ok(
        claims=[claim_ser(c) for c in pending_claims(db)],
        redemptions=[redemption_ser(r) for r in pending_redemptions(db)])


@bp.post("/parent/claims/<claim_id>")
@require_role("parent")
def parent_decide_claim(claim_id):
    """Approve or reject a quest claim (mirrors parent.decide_claim_route)."""
    db = get_db()
    approve = (request.get_json(silent=True) or {}).get("decision") == "approve"
    claim = decide_quest_claim(db, claim_id, approve, g.user)
    if not claim:
        return fail("Esa solicitud ya fue atendida.", 409)
    if approve:
        notify(db, claim["kid_id"], "quest_approved",
               f"{claim['quest_emoji']} ¡{claim['quest_title']} aprobada!",
               compose(f"Ganaste {claim['points']} puntos.",
                       f"Aprobada por {g.user['name']}."))
        check_goal_reached(db, claim["kid_id"])
    else:
        notify(db, claim["kid_id"], "quest_rejected",
               f"{claim['quest_title']} fue devuelta",
               "Inténtalo otra vez y márcala como hecha de nuevo.")
    return ok(
        message=(f"{claim['kid_name']} ganó {claim['points']} puntos por "
                 f"'{claim['quest_title']}'." if approve
                 else f"Devolvió '{claim['quest_title']}' a {claim['kid_name']}."),
        claims=[claim_ser(c) for c in pending_claims(db)],
        redemptions=[redemption_ser(r) for r in pending_redemptions(db)],
    )


@bp.post("/parent/redemptions/<redemption_id>")
@require_role("parent")
def parent_decide_redemption(redemption_id):
    """Approve (hand it over) or reject (refund) a purchase."""
    db = get_db()
    approve = (request.get_json(silent=True) or {}).get("decision") == "approve"
    red = decide_redemption(db, redemption_id, approve, g.user)
    if not red:
        return fail("Esa solicitud ya fue atendida.", 409)
    if approve:
        notify(db, red["kid_id"], "purchase_approved",
               f"{red['reward_emoji']} ¡{red['reward_title']} es tuya!",
               compose(f"{g.user['name']} te la entregó. ¡Disfrútala!",
                       f"Te costó {red['cost']} puntos."))
    else:
        notify(db, red["kid_id"], "purchase_rejected",
               f"{red['reward_title']} no fue aprobada",
               f"Tus {red['cost']} puntos fueron devueltos.")
        check_goal_reached(db, red["kid_id"])
    return ok(
        message=(f"'{red['reward_title']}' entregada a {red['kid_name']}." if approve
                 else f"Rechazada '{red['reward_title']}' — {red['cost']} puntos devueltos."),
        claims=[claim_ser(c) for c in pending_claims(db)],
        redemptions=[redemption_ser(r) for r in pending_redemptions(db)],
    )


def _repeat_days(raw):
    picked = set()
    for value in raw or []:
        day = as_int(value, default=-1, low=0, high=6)
        if day >= 0:
            picked.add(day)
    return sorted(picked)


@bp.get("/parent/quests")
@require_role("parent")
def parent_quests():
    db = get_db()
    return ok(
        quests=[quest_admin(q) for q in list_quests(db, active_only=False)],
        kids=[kid_brief(k) for k in list_kids(db)])


@bp.post("/parent/quests")
@require_role("parent")
def parent_create_quest():
    """Mirror of parent.create_quest, same validation."""
    db = get_db()
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()[:80]
    if not title:
        return fail("Dale un nombre a la quest.")
    repeat = data.get("repeat", "daily")
    repeat = repeat if repeat in REPEAT_CHOICES else "daily"
    days = _repeat_days(data.get("repeat_days"))
    if repeat == "custom_days" and not days:
        return fail("Elige al menos un día para esa quest.")

    db.quests.insert_one({
        "title": title,
        "emoji": (data.get("emoji") or "").strip()[:4] or "⭐",
        "points": as_int(data.get("points"), default=5, low=1, high=1000),
        "repeat": repeat,
        "repeat_days": days,
        "times_per_period": as_int(data.get("times_per_period"),
                                   default=1, low=1, high=20),
        "description": (data.get("description") or "").strip()[:240],
        "subtasks": parse_subtasks(data.get("subtasks", "")),
        "assigned_to": [oid(v) for v in data.get("assigned_to") or [] if oid(v)],
        "active": True,
    })
    return ok(message=f"Quest '{title}' agregada.",
              quests=[quest_admin(q) for q in list_quests(db, active_only=False)])


@bp.post("/parent/quests/<quest_id>")
@require_role("parent")
def parent_update_quest(quest_id):
    """Mirror of parent.update_quest: toggle, delete or edit."""
    db = get_db()
    quest = get_quest(db, quest_id)
    if not quest:
        return fail("No encontramos esa quest.", 404)
    data = request.get_json(silent=True) or {}
    action = data.get("action")

    if action == "toggle":
        db.quests.update_one({"_id": quest["_id"]},
                             {"$set": {"active": not quest.get("active", True)}})
    elif action == "delete":
        db.quests.delete_one({"_id": quest["_id"]})
        db.quest_claims.delete_many({"quest_id": quest["_id"], "status": "pending"})
    else:
        repeat = data.get("repeat", quest.get("repeat", "daily"))
        repeat = repeat if repeat in REPEAT_CHOICES else "daily"
        days = _repeat_days(data.get("repeat_days"))
        if repeat == "custom_days" and not days:
            return fail("Elige al menos un día para esa quest.")
        db.quests.update_one({"_id": quest["_id"]}, {"$set": {
            "title": (data.get("title") or "").strip()[:80] or quest["title"],
            "emoji": (data.get("emoji") or "").strip()[:4] or "⭐",
            "points": as_int(data.get("points"), default=quest["points"],
                             low=1, high=1000),
            "repeat": repeat,
            "repeat_days": days,
            "times_per_period": as_int(data.get("times_per_period"),
                                       default=quest.get("times_per_period", 1),
                                       low=1, high=20),
            "description": (data.get("description") or "").strip()[:240],
            "subtasks": parse_subtasks(data.get("subtasks", ""),
                                       quest.get("subtasks")),
            "assigned_to": [oid(v) for v in data.get("assigned_to") or [] if oid(v)],
        }})
    return ok(message=f"Quest '{quest['title']}' actualizada.",
              quests=[quest_admin(q) for q in list_quests(db, active_only=False)])


def _stock_fields(data, existing=None):
    """Mirror of parent._stock_fields for JSON payloads."""
    mode = data.get("stock_mode")
    if mode not in ("unlimited", "fixed", "periodic"):
        mode = "fixed" if data.get("stock") else "unlimited"
    fields = {"stock_mode": mode, "stock": None, "stock_limit": None,
              "stock_period": None, "stock_scope": None}
    if mode == "fixed":
        default = (existing or {}).get("stock") or 0
        fields["stock"] = as_int(data.get("stock"), default=default, low=0, high=9999)
    elif mode == "periodic":
        fields["stock_limit"] = as_int(data.get("stock_limit"), default=1, low=1, high=999)
        period = data.get("stock_period", "daily")
        fields["stock_period"] = period if period in STOCK_PERIODS else "daily"
        scope = data.get("stock_scope", "child")
        fields["stock_scope"] = scope if scope in STOCK_SCOPES else "child"
    return fields


@bp.get("/parent/rewards")
@require_role("parent")
def parent_rewards():
    db = get_db()
    rewards = [dict(r, stock_text=stock_label(r), mode=stock_mode(r))
               for r in list_rewards(db, active_only=False)]
    return ok(rewards=[reward_ser(r, admin=True) for r in rewards])


@bp.post("/parent/rewards")
@require_role("parent")
def parent_create_reward():
    """Mirror of parent.create_reward."""
    db = get_db()
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()[:80]
    if not title:
        return fail("Dale un nombre a la recompensa.")
    doc = {
        "title": title,
        "description": (data.get("description") or "").strip()[:240],
        "emoji": (data.get("emoji") or "").strip()[:4] or "🎁",
        "cost": as_int(data.get("cost"), default=10, low=1, high=100000),
        "active": True,
    }
    doc.update(_stock_fields(data))
    db.rewards.insert_one(doc)
    notify_many(db, list_kids(db), "shop_new",
                f"{doc['emoji']} Nueva en la tienda: {title}",
                compose(f"Cuesta {doc['cost']} puntos",
                        doc.get("description"),
                        stock_label(doc) and f"Disponible: {stock_label(doc)}"))
    return ok(message=f"'{title}' agregada a la tienda.",
              rewards=[reward_ser(dict(r, stock_text=stock_label(r), mode=stock_mode(r)),
                                  admin=True)
                       for r in list_rewards(db, active_only=False)])


@bp.post("/parent/rewards/<reward_id>")
@require_role("parent")
def parent_update_reward(reward_id):
    """Mirror of parent.update_reward: toggle, delete or edit."""
    db = get_db()
    reward = get_reward(db, reward_id)
    if not reward:
        return fail("No encontramos esa recompensa.", 404)
    data = request.get_json(silent=True) or {}
    action = data.get("action")

    if action == "toggle":
        db.rewards.update_one({"_id": reward["_id"]},
                              {"$set": {"active": not reward.get("active", True)}})
    elif action == "delete":
        db.rewards.delete_one({"_id": reward["_id"]})
        db.users.update_many({"goal_reward_id": reward["_id"]},
                             {"$set": {"goal_reward_id": None}})
    else:
        changes = {
            "title": (data.get("title") or "").strip()[:80] or reward["title"],
            "description": (data.get("description") or "").strip()[:240],
            "emoji": (data.get("emoji") or "").strip()[:4] or "🎁",
            "cost": as_int(data.get("cost"), default=reward["cost"], low=1, high=100000),
        }
        changes.update(_stock_fields(data, reward))
        db.rewards.update_one({"_id": reward["_id"]}, {"$set": changes})
    rewards = [dict(r, stock_text=stock_label(r), mode=stock_mode(r))
               for r in list_rewards(db, active_only=False)]
    return ok(message=f"'{reward['title']}' actualizada.",
              rewards=[reward_ser(r, admin=True) for r in rewards])


@bp.post("/parent/award")
@require_role("parent")
def parent_award():
    """Mirror of parent.award."""
    db = get_db()
    data = request.get_json(silent=True) or {}
    amount = as_int(data.get("amount"), default=0, low=-1000, high=1000)
    if data.get("negate"):
        amount = -abs(amount)
    if amount == 0:
        return fail("Elige una cantidad primero.")

    kid, _ = adjust_points(db, data.get("kid_id") or "", amount,
                           (data.get("reason") or "").strip()[:120], g.user,
                           kind="award" if amount > 0 else "deduct")
    if not kid:
        return fail("No encontramos a ese niño.", 404)
    if amount > 0:
        notify(db, kid["_id"], "points_awarded",
               f"⭐ ¡Ganaste {amount} puntos!",
               compose((data.get("reason") and f"Por: {data.get('reason')}"),
                       f"De {g.user['name']}",
                       f"Tienes {kid.get('points', 0)} puntos"))
        check_goal_reached(db, kid["_id"])
    return ok(message=(f"{'Dio' if amount > 0 else 'Quitó'} {abs(amount)} puntos "
                       f"{'a' if amount > 0 else 'de'} {kid['name']}."),
              kid=kid_me(kid))


@bp.get("/parent/kids")
@require_role("parent")
def parent_kids():
    db = get_db()
    return ok(
        kids=[dict(kid_brief(k), lifetime_points=k.get("lifetime_points", 0),
                   has_pin=bool(k.get("pin_hash")))
              for k in list_kids(db)],
        parents=[{"id": str(p["_id"]), "name": p["name"],
                  "avatar": p.get("avatar")} for p in list_parents(db)])


@bp.post("/parent/kids")
@require_role("parent")
def parent_add_kid():
    """Mirror of parent.add_kid."""
    db = get_db()
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()[:40]
    if not name:
        return fail("¿Cómo se llama?")
    pin = (data.get("pin") or "").strip()
    if pin and not (pin.isdigit() and 4 <= len(pin) <= 6):
        return fail("El PIN debe tener 4-6 dígitos (o dejarlo vacío).")
    create_kid(db, name,
               data.get("avatar") or AVATAR_DEFAULT,
               data.get("color") or COLOR_DEFAULT,
               pin=pin or None,
               points=as_int(data.get("points"), default=0, low=0, high=100000))
    return ok(message=f"¡{name} ya está dentro! Puede entrar desde la página principal.",
              kids=[dict(kid_brief(k), lifetime_points=k.get("lifetime_points", 0),
                         has_pin=bool(k.get("pin_hash"))) for k in list_kids(db)])


@bp.get("/parent/kids/<kid_id>")
@require_role("parent")
def parent_kid_detail(kid_id):
    db = get_db()
    kid = get_user(db, kid_id)
    if not kid or kid["role"] != "kid":
        return fail("No encontramos a ese niño.", 404)
    return ok(
        kid=dict(kid_me(kid), has_pin=bool(kid.get("pin_hash"))),
        history=[history_entry(h) for h in history_for(db, kid["_id"], limit=60)],
        redemptions=[redemption_ser(r)
                     for r in redemptions_for(db, kid["_id"], limit=20)])


@bp.post("/parent/kids/<kid_id>")
@require_role("parent")
def parent_update_kid(kid_id):
    """Mirror of parent.update_kid: edit, set/clear PIN, or delete."""
    db = get_db()
    kid = get_user(db, kid_id)
    if not kid or kid["role"] != "kid":
        return fail("No encontramos a ese niño.", 404)
    data = request.get_json(silent=True) or {}
    action = data.get("action")

    if action == "delete":
        db.users.delete_one({"_id": kid["_id"]})
        db.transactions.delete_many({"kid_id": kid["_id"]})
        db.redemptions.delete_many({"kid_id": kid["_id"]})
        db.quest_claims.delete_many({"kid_id": kid["_id"]})
        return ok(message=f"Se eliminó a {kid['name']} y su historial.",
                  kids=[dict(kid_brief(k), lifetime_points=k.get("lifetime_points", 0),
                             has_pin=bool(k.get("pin_hash"))) for k in list_kids(db)])
    if action == "pin":
        pin = (data.get("pin") or "").strip()
        if pin and not (pin.isdigit() and 4 <= len(pin) <= 6):
            return fail("El PIN debe tener 4-6 dígitos (o vacío para quitarlo).")
        db.users.update_one({"_id": kid["_id"]},
                            {"$set": {"pin_hash": _hash_pin(pin) if pin else None}})
        return ok(message=f"PIN de {kid['name']} "
                          f"{'actualizado' if pin else 'eliminado'}.")

    db.users.update_one({"_id": kid["_id"]}, {"$set": {
        "name": (data.get("name") or "").strip()[:40] or kid["name"],
        "avatar": data.get("avatar") or kid.get("avatar"),
        "color": data.get("color") or kid.get("color"),
    }})
    return ok(message="Guardado.",
              kids=[dict(kid_brief(k), lifetime_points=k.get("lifetime_points", 0),
                         has_pin=bool(k.get("pin_hash"))) for k in list_kids(db)])


def _hash_pin(pin):
    from werkzeug.security import generate_password_hash
    return generate_password_hash(pin)


AVATAR_DEFAULT = "🦊"
COLOR_DEFAULT = "#7c4dff"