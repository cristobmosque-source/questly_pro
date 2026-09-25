from flask import (Blueprint, flash, redirect, render_template, request,
                   session, url_for)

from ..db import get_db
from ..models import (create_parent, get_user, has_any_parent,
                      verify_kid_pin, verify_parent)

bp = Blueprint("auth", __name__)


REMEMBER_COOKIE = "questly_email"


def _sign_in(user, remember=True):
    session.clear()
    # Permanent means a 30-day cookie; otherwise it dies with the browser.
    session.permanent = bool(remember)
    session["uid"] = str(user["_id"])
    session["role"] = user["role"]


@bp.route("/setup", methods=["GET", "POST"])
def setup():
    """First run: create the first grown-up account."""
    db = get_db()
    if has_any_parent(db):
        return redirect(url_for("auth.parent_login"))

    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        confirm = request.form.get("confirm", "")

        error = None
        if not name or not email or not password:
            error = "Please fill in every box."
        elif "@" not in email:
            error = "That doesn't look like an email address."
        elif len(password) < 8:
            error = "Use a password of at least 8 characters."
        elif password != confirm:
            error = "The two passwords don't match."

        if error:
            flash(error, "error")
        else:
            uid = create_parent(db, name, email, password)
            _sign_in(get_user(db, uid))
            flash("Welcome! Add your kids to get started.", "success")
            return redirect(url_for("parent.family"))

    return render_template("auth/setup.html")


@bp.route("/login", methods=["GET", "POST"])
def parent_login():
    db = get_db()
    if not has_any_parent(db):
        return redirect(url_for("auth.setup"))

    if request.method == "POST":
        email = request.form.get("email", "")
        remember = bool(request.form.get("remember"))
        user = verify_parent(db, email, request.form.get("password", ""))
        if user:
            _sign_in(user, remember=remember)
            response = redirect(url_for("parent.dashboard"))
            # Remember the address to save typing next time — never the password.
            if remember:
                response.set_cookie(
                    REMEMBER_COOKIE, user["email"],
                    max_age=60 * 60 * 24 * 365, httponly=True, samesite="Lax",
                )
            else:
                response.delete_cookie(REMEMBER_COOKIE)
            return response
        flash("Email or password wasn't right.", "error")

    return render_template(
        "auth/parent_login.html",
        remembered=request.cookies.get(REMEMBER_COOKIE, ""),
    )


@bp.route("/hi/<kid_id>", methods=["GET", "POST"])
def kid_login(kid_id):
    db = get_db()
    kid = get_user(db, kid_id)
    if not kid or kid["role"] != "kid":
        return redirect(url_for("public.who"))

    if request.method == "POST":
        if verify_kid_pin(kid, request.form.get("pin", "")):
            _sign_in(kid, remember=True)
            return redirect(url_for("kid.home"))
        flash("That PIN wasn't right — try again!", "error")
        return redirect(url_for("auth.kid_login", kid_id=kid_id))

    if not kid.get("pin_hash"):
        _sign_in(kid, remember=True)
        return redirect(url_for("kid.home"))

    return render_template("auth/kid_login.html", kid=kid)


@bp.post("/logout")
def logout():
    session.clear()
    # The remembered email survives logout on purpose — it saves typing and
    # is not a credential. "Forget me" on the login page clears it.
    return redirect(url_for("public.who"))


@bp.post("/forget-me")
def forget_me():
    response = redirect(url_for("auth.parent_login"))
    response.delete_cookie(REMEMBER_COOKIE)
    flash("Forgotten. You'll need to type your email next time.", "info")
    return response
