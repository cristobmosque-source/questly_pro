"""End-to-end smoke test for the JSON API, backed by mongomock.

Runs the full flow a family would: setup -> add kid -> create quests
(daily / custom_days / once, with subtasks) -> kid claims -> parent approvals
-> missed penalties -> shop redemption. Exits nonzero if any check fails.
"""

import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import mongomock

sys.path.insert(0, ".")

from app import create_app  # noqa: E402

failures = []


def check(name, cond):
    print(("PASS  " if cond else "FAIL  ") + name)
    if not cond:
        failures.append(name)


app = create_app({"TESTING": True, "TIMEZONE": "America/Santiago",
                  "SECRET_KEY": "test"})
app.extensions["mongo_client"] = mongomock.MongoClient(tz_aware=True)
app.extensions["mongo_indexed"] = True
c = app.test_client()

TODAY = datetime.now(ZoneInfo("America/Santiago")).weekday()


def call(method, path, body=None, token=None):
    headers = {"Authorization": "Bearer " + token} if token else {}
    r = getattr(c, method)("/api/v1" + path, json=body, headers=headers)
    try:
        return r.status_code, r.get_json()
    except Exception:
        return r.status_code, None


# --- bootstrap + setup -----------------------------------------------------
code, data = call("get", "/bootstrap")
check("bootstrap is public and shows no parent yet",
      code == 200 and data["ok"] and data["has_parent"] is False and data["kids"] == [])

code, data = call("post", "/setup", {"name": "Mamá", "email": "m@x.com",
                                     "password": "12345678", "confirm": "12345678"})
check("first-run setup creates the parent and returns a token",
      code == 200 and data["ok"] and data["user"]["role"] == "parent")
PT = data["token"]

code, data = call("post", "/setup", {"name": "Otro", "email": "a@x.com",
                                     "password": "12345678", "confirm": "12345678"})
check("setup refuses a second parent", code == 409)

code, data = call("get", "/parent/badge")
check("parent endpoints require the token", code == 401)

# --- family ----------------------------------------------------------------
code, data = call("post", "/parent/kids", {"name": "Samuel", "avatar": "🦊",
                                           "color": "#7c4dff", "pin": "1234",
                                           "points": 100}, PT)
check("parent adds a kid", code == 200 and len(data["kids"]) == 1)
kid = data["kids"][0]
check("kid starts with 100 points", kid["points"] == 100)

code, data = call("post", "/parent/kids", {"name": "Mal", "pin": "12"}, PT)
check("invalid PIN is rejected", code == 400)

code, data = call("get", "/bootstrap")
check("bootstrap now lists the kid", len(data["kids"]) == 1 and data["kids"][0]["has_pin"])

code, data = call("post", "/auth/kid", {"kid_id": kid["id"], "pin": "9999"})
check("wrong PIN is rejected", code == 401)
code, data = call("post", "/auth/kid", {"kid_id": kid["id"], "pin": "1234"})
check("kid signs in with the PIN", code == 200 and data["user"]["role"] == "kid")
KT = data["token"]

code, data = call("get", "/parent/quests", token=KT)
check("kid cannot use parent endpoints", code == 403)

# --- quests ----------------------------------------------------------------
code, data = call("post", "/parent/quests", {
    "title": "Hacer la cama", "emoji": "🛏", "points": 5,
    "repeat": "custom_days",
}, PT)
check("custom_days quest requires days", code == 400)

code, data = call("post", "/parent/quests", {
    "title": "Hacer la cama", "emoji": "🛏", "points": 5,
    "repeat": "custom_days", "repeat_days": [0, 1, 2, 3, 4],
    "assigned_to": [kid["id"]],
}, PT)
check("creates 'Hacer la cama' Mon-Fri", code == 200)

code, data = call("post", "/parent/quests", {
    "title": "Sacar la basura", "emoji": "🗑", "points": 5,
    "repeat": "custom_days", "repeat_days": [0, 1, 2, 3, 4, 5, 6],
}, PT)
check("creates an every-day custom quest", code == 200)

code, data = call("post", "/parent/quests", {
    "title": "Lavarse los dientes", "emoji": "🪥", "points": 15,
    "repeat": "daily", "subtasks": "Pasta\nCepillo",
}, PT)
check("creates daily quest with subtasks", code == 200)
teeth = [q for q in data["quests"] if q["title"] == "Lavarse los dientes"][0]

code, data = call("post", "/parent/quests", {
    "title": "Ordenar el clóset", "emoji": "🧹", "points": 30, "repeat": "once",
}, PT)
check("creates a once quest", code == 200)

code, data = call("get", "/kid/home", token=KT)
titles = {q["title"] for q in data["quests"]}
bed_in = "Hacer la cama" in titles if 0 <= TODAY <= 4 else "Hacer la cama" not in titles
check("custom_days quest appears on weekdays only (today is weekday %d)" % TODAY,
      bed_in)
check("kid home shows the once quest", "Ordenar el clóset" in titles)
check("kid home shows points", data["kid"]["points"] == 100)

bed = next(q for q in data["quests"] if q["title"] == "Sacar la basura")

# --- claims + subtasks -----------------------------------------------------
code, data = call("post", f"/kid/quests/{teeth['id']}/claim", token=KT)
check("claim blocked while subtasks are unticked", code == 400)

code, data = call("post", f"/kid/quests/{teeth['id']}/step/{teeth['subtasks'][0]['id']}", token=KT)
check("subtask ticks", code == 200 and data["steps_done"] == 1)
code, data = call("post", f"/kid/quests/{teeth['id']}/step/{teeth['subtasks'][0]['id']}", token=KT)
check("subtask unticks", code == 200 and data["steps_done"] == 0)

code, data = call("post", f"/kid/quests/{bed['id']}/claim", token=KT)
check("kid claims 'Hacer la cama'", code == 200 and
      any(q["state"] == "pending" for q in data["quests"]))

code, data = call("post", f"/kid/quests/{bed['id']}/claim", token=KT)
check("double claim is refused", code == 400)

code, data = call("get", "/parent/approvals", token=PT)
check("parent sees the pending claim", len(data["claims"]) == 1)
claim = data["claims"][0]

code, data = call("post", f"/parent/claims/{claim['id']}", {"decision": "approve"}, PT)
check("parent approves the claim", code == 200 and data["claims"] == [])
kid_now = None
code, data = call("get", f"/parent/kids/{kid['id']}", token=PT)
check("kid now has 105 points", data["kid"]["points"] == 105)

# --- missed penalty ---------------------------------------------------------
code, data = call("get", "/parent/today", token=PT)
row = next(r for r in data["rows"] if r["kid"]["id"] == kid["id"])
teeth_today = next(q for q in row["quests"] if q["title"] == "Lavarse los dientes")
check("today lists the teeth quest as open", teeth_today["state"] == "open")
check("penalty is half (15 -> 7.5)", teeth_today["penalty"] == 7.5)

code, data = call("post", f"/parent/quests/{teeth['id']}/missed/{kid['id']}", token=PT)
check("parent marks it missed", code == 200)
code, data = call("post", f"/parent/quests/{teeth['id']}/missed/{kid['id']}", token=PT)
check("cannot penalise the same period twice", code == 400)

code, data = call("get", f"/parent/kids/{kid['id']}", token=PT)
kinds = [h["kind"] for h in data["history"]]
check("history records quest + missed", "quest" in kinds and "missed" in kinds)
check("balance after penalty is 97.5", data["kid"]["points"] == 97.5)

code, data = call("get", "/kid/home", token=KT)
teeth_state = next(q["state"] for q in data["quests"] if q["title"] == "Lavarse los dientes")
check("kid sees the quest as missed", teeth_state == "missed")
code, data = call("post", f"/kid/quests/{teeth['id']}/claim", token=KT)
check("kid cannot claim a missed quest", code == 400)

# --- shop -------------------------------------------------------------------
code, data = call("post", "/parent/rewards", {
    "title": "Ir al cine", "emoji": "🎬", "cost": 50,
    "stock_mode": "periodic", "stock_limit": 1, "stock_period": "weekly",
    "stock_scope": "child",
}, PT)
check("parent creates a reward", code == 200)

code, data = call("get", "/kid/shop", token=KT)
check("kid sees the reward in the shop", len(data["rewards"]) == 1)
reward = data["rewards"][0]

code, data = call("post", f"/kid/shop/{reward['id']}/buy", token=KT)
check("kid redeems the reward", code == 200)
code, data = call("post", f"/kid/shop/{reward['id']}/buy", token=KT)
check("periodic stock blocks a second buy", code == 400)

code, data = call("get", "/kid/history", token=KT)
check("kid history shows the redemption",
      any(h["kind"] == "redeem" for h in data["history"]))
check("kid history shows pending redemption", data["redemptions"][0]["status"] == "pending")
red_id = data["redemptions"][0]["id"]

code, data = call("post", f"/parent/redemptions/{red_id}", {"decision": "reject"}, PT)
check("parent rejects the redemption (refund)", code == 200)
code, data = call("get", f"/parent/kids/{kid['id']}", token=PT)
check("refund restores points", data["kid"]["points"] == 97.5)

# --- verdicts 100% / 25% / -50% + kid retraction ----------------------------
code, data = call("post", "/parent/quests", {
    "title": "Leer un rato", "emoji": "📖", "points": 8,
    "repeat": "daily", "assigned_to": [kid["id"]],
}, PT)
check("creates the reading quest", code == 200)
read = next(q for q in data["quests"] if q["title"] == "Leer un rato")

code, data = call("post", f"/kid/quests/{read['id']}/claim", token=KT)
check("kid claims the reading quest", code == 200)
code, data = call("post", f"/kid/quests/{read['id']}/retract", token=KT)
check("kid retracts while it's pending", code == 200)
check("retracted quest is open again",
      any(q["state"] == "open" for q in data["quests"]
          if q["id"] == read["id"]))
code, data = call("post", f"/kid/quests/{read['id']}/retract", token=KT)
check("nothing pending means no retraction", code == 400)

code, data = call("post", f"/kid/quests/{read['id']}/claim", token=KT)
check("claims again after retracting", code == 200)
code, data = call("get", "/parent/approvals", token=PT)
claim2 = data["claims"][0]
code, data = call("post", f"/parent/claims/{claim2['id']}",
                  {"decision": "partial"}, PT)
check("halfway verdict pays 25% (8 -> 2)", code == 200)
code, data = call("get", f"/parent/kids/{kid['id']}", token=PT)
check("balance includes the 2 partial points", data["kid"]["points"] == 99.5)
check("history records the partial payout",
      any(h["kind"] == "partial" for h in data["history"]))

code, data = call("get", "/kid/home", token=KT)
closet = next(q for q in data["quests"] if q["title"] == "Ordenar el clóset")
code, data = call("post", f"/kid/quests/{closet['id']}/claim", token=KT)
check("kid claims the once quest", code == 200)
code, data = call("get", "/parent/approvals", token=PT)
claim3 = data["claims"][0]
code, data = call("post", f"/parent/claims/{claim3['id']}",
                  {"decision": "not_done"}, PT)
check("not-done verdict costs 50% (30 -> -15)", code == 200)
code, data = call("get", f"/parent/kids/{kid['id']}", token=PT)
check("balance after not_done is 84.5", data["kid"]["points"] == 84.5)
code, data = call("post", f"/kid/quests/{read['id']}/retract", token=KT)
check("retracting a decided claim is refused", code == 400)
code, data = call("post", f"/parent/claims/{claim3['id']}",
                  {"decision": "approve"}, PT)
check("the verdict is final — it can't be redone", code == 409)

# --- goal -------------------------------------------------------------------
code, data = call("post", f"/kid/goal/{reward['id']}", token=KT)
check("kid sets a savings goal", code == 200)

print()
if failures:
    print(f"{len(failures)} check(s) FAILED")
    sys.exit(1)
print("All API checks passed.")