"""Route guards shared by the blueprints."""

from functools import wraps

from flask import current_app, flash, g, redirect, url_for


def parent_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not g.user:
            return redirect(url_for("auth.parent_login"))
        if g.user["role"] != "parent":
            flash("That's a grown-up page!", "warn")
            return redirect(url_for("kid.home"))
        return view(*args, **kwargs)
    return wrapped


def kid_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not g.user:
            return redirect(url_for("public.who"))
        if g.user["role"] != "kid":
            return redirect(url_for("parent.dashboard"))
        return view(*args, **kwargs)
    return wrapped


def safe_next(default):
    """Return the form's `next` target, but only if it's a path on this site.
    Stops a crafted form from bouncing a signed-in parent off to another host."""
    from flask import request
    target = request.form.get("next", "")
    if target.startswith("/") and not target.startswith("//"):
        return target
    return default


def local_now():
    from datetime import datetime
    return datetime.now(current_app.config["TZINFO"])


def as_int(value, default=0, low=None, high=None):
    try:
        out = int(str(value).strip())
    except (TypeError, ValueError):
        return default
    if low is not None:
        out = max(low, out)
    if high is not None:
        out = min(high, out)
    return out


def check_goal_reached(db, kid_id):
    """If a child has just crossed the price of what they're saving for, tell
    them — once. The flag resets whenever they pick a different goal."""
    from ..models import get_reward, get_user
    from ..notify import notify

    kid = get_user(db, kid_id)
    if not kid or kid.get("role") != "kid" or not kid.get("goal_reward_id"):
        return
    if kid.get("goal_notified"):
        return

    reward = get_reward(db, kid["goal_reward_id"])
    if not reward or kid.get("points", 0) < reward["cost"]:
        return

    db.users.update_one({"_id": kid["_id"]}, {"$set": {"goal_notified": True}})
    notify(db, kid, "goal_reached",
           f"You can get {reward['title']}!",
           f"You've saved up {reward['cost']} points. It's waiting in the shop.")
