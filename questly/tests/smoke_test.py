"""End-to-end smoke test: walks every user flow against a real MongoDB.

Run it against a throwaway database, never your family's data:

    MONGO_DB=questly_test python tests/smoke_test.py

Or inside the running stack:

    docker compose exec -e MONGO_DB=questly_test web python tests/smoke_test.py

It wipes every collection in the target database before it starts, so it
refuses to run unless the database name ends in `_test`.
"""
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DB_NAME = os.environ.get("MONGO_DB", "")
if not DB_NAME.endswith("_test"):
    sys.exit("Refusing to run: point MONGO_DB at a database whose name ends "
             "in '_test' (this script deletes everything in it).")

from app import create_app
from app.db import get_db
from app.models import check_password

FAILS = []

def check(label, cond, extra=""):
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"   [{extra}]" if extra and not cond else ""))
    if not cond:
        FAILS.append(label)

app = create_app()
with app.app_context():
    db = get_db()
    for c in ("users", "rewards", "transactions", "redemptions", "quests", "quest_claims"):
        db[c].delete_many({})

def token(client, path):
    """Pull the CSRF token out of a rendered page."""
    html = client.get(path).get_data(as_text=True)
    m = re.search(r'name="_csrf" value="([^"]+)"', html)
    return m.group(1) if m else None

parent = app.test_client()
kidcli = app.test_client()

print("\n--- first-run setup ---")
r = parent.get("/", follow_redirects=False)
check("/ redirects to /setup when empty", r.headers.get("Location", "").endswith("/setup"), r.headers.get("Location"))

t = token(parent, "/setup")
r = parent.post("/setup", data={"_csrf": t, "name": "Matt", "email": "matt@example.com",
                                "password": "password123", "confirm": "password123"},
                follow_redirects=True)
check("setup creates parent and logs in", "Family" in r.get_data(as_text=True))

print("\n--- csrf ---")
r = parent.post("/setup", data={"name": "X", "email": "x@y.z", "password": "password123",
                                "confirm": "password123"})
check("POST without a CSRF token is rejected", r.status_code == 400, str(r.status_code))

print("\n--- add a child ---")
t = token(parent, "/parent/family")
r = parent.post("/parent/family/kids", data={"_csrf": t, "name": "Ava", "avatar": "\U0001f984",
                                             "color": "#ff4d94", "pin": "1234", "points": "0"},
                follow_redirects=True)
check("child added", "Ava" in r.get_data(as_text=True))

with app.app_context():
    db = get_db()
    kid = db.users.find_one({"name": "Ava"})
kid_id = str(kid["_id"])
check("child starts on zero points", kid["points"] == 0, str(kid["points"]))

print("\n--- awarding points ---")
t = token(parent, "/parent/")
parent.post("/parent/award", data={"_csrf": t, "kid_id": kid_id, "amount": "25",
                                   "reason": "Tidied the whole kitchen"}, follow_redirects=True)
with app.app_context():
    kid = get_db().users.find_one({"_id": kid["_id"]})
check("+25 applied", kid["points"] == 25, str(kid["points"]))

parent.post("/parent/award", data={"_csrf": t, "kid_id": kid_id, "amount": "5",
                                   "negate": "1", "reason": "Wouldn't share"}, follow_redirects=True)
with app.app_context():
    db = get_db()
    kid = db.users.find_one({"_id": kid["_id"]})
    ledger = list(db.transactions.find({"kid_id": kid["_id"]}).sort("created_at", 1))
check("take-away applied", kid["points"] == 20, str(kid["points"]))
check("ledger has both entries", len(ledger) == 2, str(len(ledger)))
check("ledger balance_after tracks", [e["balance_after"] for e in ledger] == [25, 20],
      str([e["balance_after"] for e in ledger]))

parent.post("/parent/award", data={"_csrf": t, "kid_id": kid_id, "amount": "9999",
                                   "negate": "1", "reason": "overdraw attempt"}, follow_redirects=True)
with app.app_context():
    kid = get_db().users.find_one({"_id": kid["_id"]})
check("balance cannot go negative", kid["points"] == 0, str(kid["points"]))

parent.post("/parent/award", data={"_csrf": t, "kid_id": kid_id, "amount": "50",
                                   "reason": "Great week"}, follow_redirects=True)

print("\n--- shop admin ---")
t = token(parent, "/parent/rewards")
parent.post("/parent/rewards", data={"_csrf": t, "title": "Cinema trip", "emoji": "\U0001f37f",
                                     "cost": "30", "stock": "1",
                                     "description": "Popcorn included"}, follow_redirects=True)
parent.post("/parent/rewards", data={"_csrf": t, "title": "Very Expensive Thing", "emoji": "\U0001f48e",
                                     "cost": "5000", "stock": ""}, follow_redirects=True)
with app.app_context():
    db = get_db()
    reward = db.rewards.find_one({"title": "Cinema trip"})
    pricey = db.rewards.find_one({"title": "Very Expensive Thing"})
check("reward created with stock", reward and reward["stock"] == 1)
check("blank stock means unlimited", pricey and pricey["stock"] is None)

print("\n--- quest admin ---")
t = token(parent, "/parent/quests")
parent.post("/parent/quests", data={"_csrf": t, "title": "Read for 20 minutes", "emoji": "\U0001f4d6",
                                    "points": "5", "repeat": "daily"}, follow_redirects=True)
with app.app_context():
    quest = get_db().quests.find_one({"title": "Read for 20 minutes"})
check("quest created", quest is not None)

print("\n--- kid login by PIN ---")
r = kidcli.get(f"/hi/{kid_id}")
check("PIN page shown", "pinform" in r.get_data(as_text=True))
t = token(kidcli, f"/hi/{kid_id}")
r = kidcli.post(f"/hi/{kid_id}", data={"_csrf": t, "pin": "0000"}, follow_redirects=True)
check("wrong PIN refused", "pinform" in r.get_data(as_text=True))
t = token(kidcli, f"/hi/{kid_id}")
r = kidcli.post(f"/hi/{kid_id}", data={"_csrf": t, "pin": "1234"}, follow_redirects=True)
check("right PIN gets in", "Ava" in r.get_data(as_text=True) and "Today's quests" in r.get_data(as_text=True))

print("\n--- kid cannot reach parent pages ---")
r = kidcli.get("/parent/", follow_redirects=False)
check("kid bounced off parent area", r.status_code in (301, 302), str(r.status_code))

print("\n--- kid does a quest ---")
t = token(kidcli, "/me/")
r = kidcli.post(f"/me/quests/{quest['_id']}/done", data={"_csrf": t}, follow_redirects=True)
check("quest claim shows as waiting", "Waiting" in r.get_data(as_text=True))
t = token(kidcli, "/me/")
kidcli.post(f"/me/quests/{quest['_id']}/done", data={"_csrf": t}, follow_redirects=True)
with app.app_context():
    claims = list(get_db().quest_claims.find({"quest_id": quest["_id"]}))
check("same quest can't be claimed twice in a day", len(claims) == 1, str(len(claims)))

with app.app_context():
    claim = get_db().quest_claims.find_one({"quest_id": quest["_id"]})
t = token(parent, "/parent/approvals")
parent.post(f"/parent/approvals/quest/{claim['_id']}",
            data={"_csrf": t, "decision": "approve"}, follow_redirects=True)
with app.app_context():
    kid = get_db().users.find_one({"_id": kid["_id"]})
check("approved quest pays out", kid["points"] == 55, str(kid["points"]))

print("\n--- kid buys a reward ---")
t = token(kidcli, "/me/shop")
r = kidcli.post(f"/me/shop/{reward['_id']}/buy", data={"_csrf": t}, follow_redirects=True)
with app.app_context():
    db = get_db()
    kid = db.users.find_one({"_id": kid["_id"]})
    red = db.redemptions.find_one({"reward_id": reward["_id"]})
    stock = db.rewards.find_one({"_id": reward["_id"]})["stock"]
check("points deducted at purchase", kid["points"] == 25, str(kid["points"]))
check("redemption queued for approval", red and red["status"] == "pending")
check("stock decremented", stock == 0, str(stock))

t = token(kidcli, "/me/shop")
r = kidcli.post(f"/me/shop/{reward['_id']}/buy", data={"_csrf": t}, follow_redirects=True)
check("sold-out item can't be bought again", "sold out" in r.get_data(as_text=True).lower())

t = token(kidcli, "/me/shop")
r = kidcli.post(f"/me/shop/{pricey['_id']}/buy", data={"_csrf": t}, follow_redirects=True)
with app.app_context():
    kid = get_db().users.find_one({"_id": kid["_id"]})
check("can't buy what you can't afford", kid["points"] == 25, str(kid["points"]))

print("\n--- parent refunds a purchase ---")
t = token(parent, "/parent/approvals")
parent.post(f"/parent/approvals/redemption/{red['_id']}",
            data={"_csrf": t, "decision": "reject"}, follow_redirects=True)
with app.app_context():
    db = get_db()
    kid = db.users.find_one({"_id": kid["_id"]})
    stock = db.rewards.find_one({"_id": reward["_id"]})["stock"]
check("refund returns the points", kid["points"] == 55, str(kid["points"]))
check("refund restores stock", stock == 1, str(stock))

t = token(parent, "/parent/approvals")
r = parent.post(f"/parent/approvals/redemption/{red['_id']}",
                data={"_csrf": t, "decision": "approve"}, follow_redirects=True)
with app.app_context():
    kid = get_db().users.find_one({"_id": kid["_id"]})
check("a decided request can't be decided twice", kid["points"] == 55, str(kid["points"]))

print("\n--- remaining pages render ---")
for path in ["/me/", "/me/shop", "/me/stuff"]:
    check(f"kid page {path}", kidcli.get(path).status_code == 200)
for path in ["/parent/", "/parent/approvals", "/parent/rewards", "/parent/quests",
             "/parent/family", f"/parent/kid/{kid_id}"]:
    check(f"parent page {path}", parent.get(path).status_code == 200)
check("/who renders", app.test_client().get("/who").status_code == 200)
check("/healthz ok", app.test_client().get("/healthz").status_code == 200)
check("404 page renders", app.test_client().get("/nope").status_code == 404)

print("\n--- grown-up account: own details ---")
t = token(parent, "/parent/account")
parent.post("/parent/account/profile", data={
    "_csrf": t, "name": "Matt H", "email": "matt.new@example.com",
    "avatar": "\U0001f98a"}, follow_redirects=True)
with app.app_context():
    me = get_db().users.find_one({"role": "parent", "name": "Matt H"})
check("name, email and icon all saved",
      me and me["email"] == "matt.new@example.com" and me["avatar"] == "\U0001f98a")

t = token(parent, "/parent/account")
r = parent.post("/parent/account/profile", data={
    "_csrf": t, "name": "Matt H", "email": "not-an-email"}, follow_redirects=True)
with app.app_context():
    me = get_db().users.find_one({"_id": me["_id"]})
check("a malformed email is rejected", me["email"] == "matt.new@example.com")

print("\n--- grown-up account: password ---")
t = token(parent, "/parent/account")
parent.post("/parent/account/password", data={
    "_csrf": t, "current_password": "wrong-one",
    "new_password": "brandnewpass", "confirm_password": "brandnewpass"},
    follow_redirects=True)
with app.app_context():
    me = get_db().users.find_one({"_id": me["_id"]})
check("wrong current password leaves it unchanged", check_password(me, "password123"))

t = token(parent, "/parent/account")
parent.post("/parent/account/password", data={
    "_csrf": t, "current_password": "password123",
    "new_password": "brandnewpass", "confirm_password": "mismatch"},
    follow_redirects=True)
with app.app_context():
    me = get_db().users.find_one({"_id": me["_id"]})
check("mismatched confirmation is refused", check_password(me, "password123"))

t = token(parent, "/parent/account")
parent.post("/parent/account/password", data={
    "_csrf": t, "current_password": "password123",
    "new_password": "brandnewpass", "confirm_password": "brandnewpass"},
    follow_redirects=True)
with app.app_context():
    me = get_db().users.find_one({"_id": me["_id"]})
check("correct current password changes it", check_password(me, "brandnewpass"))

fresh = app.test_client()
t = token(fresh, "/login")
r = fresh.post("/login", data={"_csrf": t, "email": "matt.new@example.com",
                               "password": "brandnewpass"}, follow_redirects=True)
check("can log in with the new password", "Award points" in r.get_data(as_text=True))

print("\n--- resetting the other grown-up's password ---")
t = token(parent, "/parent/family")
parent.post("/parent/family/parents", data={
    "_csrf": t, "name": "Partner", "email": "partner@example.com",
    "password": "partnerpass"}, follow_redirects=True)
with app.app_context():
    other = get_db().users.find_one({"email": "partner@example.com"})
check("second grown-up added", other is not None)

t = token(parent, "/parent/family")
parent.post(f"/parent/family/parents/{other['_id']}/password", data={
    "_csrf": t, "new_password": "resetbyme1", "your_password": "wrong"},
    follow_redirects=True)
with app.app_context():
    other = get_db().users.find_one({"_id": other["_id"]})
check("reset refused without your own password", check_password(other, "partnerpass"))

t = token(parent, "/parent/family")
parent.post(f"/parent/family/parents/{other['_id']}/password", data={
    "_csrf": t, "new_password": "resetbyme1", "your_password": "brandnewpass"},
    follow_redirects=True)
with app.app_context():
    other = get_db().users.find_one({"_id": other["_id"]})
check("reset works when you confirm with yours", check_password(other, "resetbyme1"))

t = token(parent, "/parent/account")
r = parent.post("/parent/account/profile", data={
    "_csrf": t, "name": "Matt H", "email": "partner@example.com"},
    follow_redirects=True)
with app.app_context():
    me = get_db().users.find_one({"_id": me["_id"]})
check("can't take an email another account uses",
      me["email"] == "matt.new@example.com")

print("\n--- a kid can't reach the account pages ---")
check("kid blocked from /parent/account",
      kidcli.get("/parent/account", follow_redirects=False).status_code in (301, 302))

print("\n--- child picks a theme ---")
t = token(kidcli, "/me/theme")
kidcli.post("/me/theme", data={"_csrf": t, "theme": "ocean"}, follow_redirects=True)
with app.app_context():
    kid = get_db().users.find_one({"_id": kid["_id"]})
check("theme saved", kid.get("theme") == "ocean", str(kid.get("theme")))
check("accent mirrored onto colour so grown-up views match",
      kid.get("color") == "#0ea5e9", str(kid.get("color")))
check("theme reaches the page", 'data-theme="ocean"' in kidcli.get("/me/").get_data(as_text=True))

t = token(kidcli, "/me/theme")
kidcli.post("/me/theme", data={"_csrf": t, "theme": "not-a-theme"}, follow_redirects=True)
with app.app_context():
    kid = get_db().users.find_one({"_id": kid["_id"]})
check("a bogus theme is refused", kid.get("theme") == "ocean")

print("\n--- child saves up for a chosen reward ---")
t = token(parent, "/parent/rewards")
parent.post("/parent/rewards", data={"_csrf": t, "title": "Big Telescope", "emoji": "\U0001f52d",
                                     "cost": "9000", "stock_mode": "unlimited"},
            follow_redirects=True)
with app.app_context():
    telescope = get_db().rewards.find_one({"title": "Big Telescope"})

html = kidcli.get("/me/").get_data(as_text=True)
check("with no goal set, home shows the cheapest unaffordable reward",
      "Next reward" in html and "Big Telescope" not in html)

t = token(kidcli, "/me/shop")
kidcli.post(f"/me/goal/{telescope['_id']}", data={"_csrf": t}, follow_redirects=True)
with app.app_context():
    kid = get_db().users.find_one({"_id": kid["_id"]})
check("goal stored on the child", kid.get("goal_reward_id") == telescope["_id"])
html = kidcli.get("/me/").get_data(as_text=True)
check("home now tracks the chosen reward", "Saving for" in html and "Big Telescope" in html)

t = token(kidcli, "/me/shop")
kidcli.post("/me/goal/clear", data={"_csrf": t}, follow_redirects=True)
with app.app_context():
    kid = get_db().users.find_one({"_id": kid["_id"]})
check("goal cleared", kid.get("goal_reward_id") is None)

t = token(kidcli, "/me/shop")
kidcli.post(f"/me/goal/{telescope['_id']}", data={"_csrf": t}, follow_redirects=True)
t = token(parent, "/parent/rewards")
parent.post(f"/parent/rewards/{telescope['_id']}", data={"_csrf": t, "action": "delete"},
            follow_redirects=True)
with app.app_context():
    kid = get_db().users.find_one({"_id": kid["_id"]})
check("deleting a reward stops anyone saving for a ghost",
      kid.get("goal_reward_id") is None)

print("\n--- stock that replenishes ---")
t = token(parent, "/parent/family")
parent.post("/parent/family/kids", data={"_csrf": t, "name": "Sibling", "avatar": "\U0001f43c",
                                         "color": "#28c8f5", "points": "500"},
            follow_redirects=True)
with app.app_context():
    db = get_db()
    sibling = db.users.find_one({"name": "Sibling"})
sibcli = app.test_client()
sibcli.get(f"/hi/{sibling['_id']}")     # no PIN, straight in

t = token(parent, "/parent/")
parent.post("/parent/award", data={"_csrf": t, "kid_id": str(kid["_id"]), "amount": "500",
                                   "reason": "stock test"}, follow_redirects=True)

t = token(parent, "/parent/rewards")
parent.post("/parent/rewards", data={"_csrf": t, "title": "Screen Time", "emoji": "\U0001f4f1",
                                     "cost": "5", "stock_mode": "periodic", "stock_limit": "2",
                                     "stock_period": "daily", "stock_scope": "child"},
            follow_redirects=True)
parent.post("/parent/rewards", data={"_csrf": t, "title": "Family Film", "emoji": "\U0001f37f",
                                     "cost": "5", "stock_mode": "periodic", "stock_limit": "1",
                                     "stock_period": "weekly", "stock_scope": "family"},
            follow_redirects=True)
with app.app_context():
    db = get_db()
    screen = db.rewards.find_one({"title": "Screen Time"})
    film = db.rewards.find_one({"title": "Family Film"})
check("periodic reward stored", screen and screen["stock_mode"] == "periodic"
      and screen["stock_limit"] == 2 and screen["stock_period"] == "daily")

def buy(client, reward):
    tok = token(client, "/me/shop")
    return client.post(f"/me/shop/{reward['_id']}/buy", data={"_csrf": tok},
                       follow_redirects=True).get_data(as_text=True)

buy(kidcli, screen); buy(kidcli, screen)
with app.app_context():
    n = get_db().redemptions.count_documents({"reward_id": screen["_id"], "kid_id": kid["_id"]})
check("both of the daily allowance can be bought", n == 2, str(n))

buy(kidcli, screen)
with app.app_context():
    n = get_db().redemptions.count_documents({"reward_id": screen["_id"], "kid_id": kid["_id"]})
check("a third is refused once the allowance is gone", n == 2, str(n))

buy(sibcli, screen)
with app.app_context():
    n = get_db().redemptions.count_documents({"reward_id": screen["_id"], "kid_id": sibling["_id"]})
check("per-child allowance is separate for a sibling", n == 1, str(n))

buy(kidcli, film)
buy(sibcli, film)
with app.app_context():
    n = get_db().redemptions.count_documents({"reward_id": film["_id"]})
check("a whole-family allowance is shared, not per child", n == 1, str(n))

with app.app_context():
    db = get_db()
    before = db.users.find_one({"_id": kid["_id"]})["points"]
    red = db.redemptions.find_one({"reward_id": screen["_id"], "kid_id": kid["_id"],
                                   "status": "pending"})
t = token(parent, "/parent/approvals")
parent.post(f"/parent/approvals/redemption/{red['_id']}",
            data={"_csrf": t, "decision": "reject"}, follow_redirects=True)
with app.app_context():
    db = get_db()
    after = db.users.find_one({"_id": kid["_id"]})["points"]
check("rejecting a periodic purchase refunds the points", after == before + 5,
      f"{before} -> {after}")
buy(kidcli, screen)
with app.app_context():
    n = get_db().redemptions.count_documents({"reward_id": screen["_id"], "kid_id": kid["_id"],
                                              "status": {"$in": ["pending", "approved"]}})
check("...and frees the slot back up", n == 2, str(n))

print("\n--- remember me ---")
rc = app.test_client()
t = token(rc, "/login")
rc.post("/login", data={"_csrf": t, "email": "matt.new@example.com",
                        "password": "brandnewpass", "remember": "1"}, follow_redirects=True)
cookie = rc.get_cookie("questly_email")
check("ticking remember stores the email in a cookie",
      cookie is not None and cookie.value == "matt.new@example.com",
      str(cookie.value if cookie else None))
check("the password is never stored",
      not any("brandnewpass" in (c.value or "") for c in [rc.get_cookie("questly_email")] if c))

page = rc.get("/login").get_data(as_text=True)
check("the login form is prefilled next time", 'value="matt.new@example.com"' in page)

t = token(rc, "/login")
rc.post("/forget-me", data={"_csrf": t}, follow_redirects=True)
check("forget-me clears it", rc.get_cookie("questly_email") is None)

plain = app.test_client()
t = token(plain, "/login")
plain.post("/login", data={"_csrf": t, "email": "matt.new@example.com",
                           "password": "brandnewpass"}, follow_redirects=True)
check("leaving remember unticked logs you in but stores nothing",
      plain.get("/parent/").status_code == 200 and plain.get_cookie("questly_email") is None)

print("\n--- notifications ---")
from app.notify import CHANNELS, EVENTS, deliver, recent, unread_count

with app.app_context():
    db = get_db()
    db.notifications.delete_many({})
    parent_doc = db.users.find_one({"_id": me["_id"]})

# a purchase should tell the grown-ups. Use a fresh unlimited reward — the
# earlier tests have already used up this child's allowance on the others.
t = token(parent, "/parent/rewards")
parent.post("/parent/rewards", data={"_csrf": t, "title": "Sticker", "emoji": "\U0001f31f",
                                     "cost": "1", "stock_mode": "unlimited"},
            follow_redirects=True)
with app.app_context():
    sticker = get_db().rewards.find_one({"title": "Sticker"})
    get_db().notifications.delete_many({})
t = token(kidcli, "/me/shop")
kidcli.post(f"/me/shop/{sticker['_id']}/buy", data={"_csrf": t}, follow_redirects=True)
with app.app_context():
    db = get_db()
    n = db.notifications.count_documents({"user_id": me["_id"], "event": "approval_waiting"})
check("buying notifies the grown-ups", n >= 1, str(n))

# approving should tell the child
with app.app_context():
    red = get_db().redemptions.find_one({"kid_id": kid["_id"], "status": "pending"})
t = token(parent, "/parent/approvals")
parent.post(f"/parent/approvals/redemption/{red['_id']}",
            data={"_csrf": t, "decision": "approve"}, follow_redirects=True)
with app.app_context():
    n = get_db().notifications.count_documents({"user_id": kid["_id"],
                                                "event": "purchase_approved"})
check("approving a purchase notifies the child", n == 1, str(n))

# a new shop item should tell every child
t = token(parent, "/parent/rewards")
parent.post("/parent/rewards", data={"_csrf": t, "title": "Roller Skates", "emoji": "\U0001f6fc",
                                     "cost": "300", "stock_mode": "unlimited"},
            follow_redirects=True)
with app.app_context():
    db = get_db()
    kids = db.users.count_documents({"role": "kid"})
    n = db.notifications.count_documents({"event": "shop_new"})
check("a new shop item notifies every child", n == kids, f"{n} of {kids}")

# awarding points
t = token(parent, "/parent/")
parent.post("/parent/award", data={"_csrf": t, "kid_id": str(kid["_id"]), "amount": "10",
                                   "reason": "Being helpful"}, follow_redirects=True)
with app.app_context():
    n = get_db().notifications.count_documents({"user_id": kid["_id"],
                                                "event": "points_awarded"})
check("awarding points notifies the child", n == 1, str(n))

print("\n--- reaching a savings goal ---")
with app.app_context():
    db = get_db()
    db.notifications.delete_many({"event": "goal_reached"})
    skates = db.rewards.find_one({"title": "Roller Skates"})
    db.users.update_one({"_id": kid["_id"]},
                        {"$set": {"points": 0, "goal_reward_id": skates["_id"],
                                  "goal_notified": False}})
t = token(parent, "/parent/")
parent.post("/parent/award", data={"_csrf": t, "kid_id": str(kid["_id"]), "amount": "100",
                                   "reason": "part way"}, follow_redirects=True)
with app.app_context():
    n = get_db().notifications.count_documents({"user_id": kid["_id"], "event": "goal_reached"})
check("no goal alert before they can afford it", n == 0, str(n))

t = token(parent, "/parent/")
parent.post("/parent/award", data={"_csrf": t, "kid_id": str(kid["_id"]), "amount": "250",
                                   "reason": "there"}, follow_redirects=True)
with app.app_context():
    n = get_db().notifications.count_documents({"user_id": kid["_id"], "event": "goal_reached"})
check("goal alert fires when they get there", n == 1, str(n))

t = token(parent, "/parent/")
parent.post("/parent/award", data={"_csrf": t, "kid_id": str(kid["_id"]), "amount": "50",
                                   "reason": "more"}, follow_redirects=True)
with app.app_context():
    n = get_db().notifications.count_documents({"user_id": kid["_id"], "event": "goal_reached"})
check("and doesn't nag on every award after that", n == 1, str(n))

print("\n--- the in-app feed ---")
with app.app_context():
    db = get_db()
    before = unread_count(db, kid["_id"])
check("unread count reflects the feed", before > 0, str(before))
kidcli.get("/me/news")
with app.app_context():
    after = unread_count(get_db(), kid["_id"])
check("opening the feed marks them read", after == 0, str(after))
check("the feed renders", kidcli.get("/me/news").status_code == 200)
check("grown-up feed renders", parent.get("/parent/news").status_code == 200)

print("\n--- delivery channels ---")
t = token(parent, "/parent/account")
parent.post(f"/parent/channels/{me['_id']}", data={
    "_csrf": t, "type": "ntfy", "ntfy__topic": "questly-test-topic",
    "ntfy__server": "http://127.0.0.1:9"}, follow_redirects=True)
with app.app_context():
    owner = get_db().users.find_one({"_id": me["_id"]})
chans = owner.get("channels", [])
check("channel saved against the grown-up", len(chans) == 1 and chans[0]["type"] == "ntfy")
check("the secret-free summary is used in the UI",
      "questly-test-topic" in __import__("app.notify", fromlist=["x"]).channel_summary(chans[0]))

t = token(parent, "/parent/family")
parent.post(f"/parent/channels/{kid['_id']}", data={
    "_csrf": t, "type": "signal", "signal__api_url": "http://127.0.0.1:9",
    "signal__number": "+440000000000", "signal__recipients": "+440000000001"},
    follow_redirects=True)
with app.app_context():
    kid_doc = get_db().users.find_one({"_id": kid["_id"]})
check("a grown-up can set up a channel for a child",
      len(kid_doc.get("channels", [])) == 1)

t = token(parent, "/parent/family")
parent.post(f"/parent/channels/{kid['_id']}", data={
    "_csrf": t, "type": "signal", "signal__api_url": "http://127.0.0.1:9"},
    follow_redirects=True)
with app.app_context():
    kid_doc = get_db().users.find_one({"_id": kid["_id"]})
check("a channel missing required fields is refused",
      len(kid_doc.get("channels", [])) == 1)

ok, detail = deliver({"type": "ntfy", "config": {"topic": "x", "server": "http://127.0.0.1:9"}},
                     "t", "b")
check("an unreachable endpoint fails gracefully rather than raising", ok is False)
ok, detail = deliver({"type": "nonsense", "config": {}}, "t", "b")
check("an unknown channel type is reported, not raised",
      ok is False and "Unknown" in detail)

with app.app_context():
    other = get_db().users.find_one({"email": "partner@example.com"})
t = token(parent, "/parent/account")
parent.post(f"/parent/channels/{other['_id']}", data={
    "_csrf": t, "type": "ntfy", "ntfy__topic": "sneaky"}, follow_redirects=True)
with app.app_context():
    other = get_db().users.find_one({"_id": other["_id"]})
check("you can't add channels to another grown-up's account",
      not other.get("channels"))

t = token(parent, "/parent/account")
parent.post(f"/parent/channels/{me['_id']}/{chans[0]['id']}/delete",
            data={"_csrf": t}, follow_redirects=True)
with app.app_context():
    owner = get_db().users.find_one({"_id": me["_id"]})
check("channel removed", not owner.get("channels"))

print("\n--- signal groups and message shape ---")
from app.notify import compose, signal_groups

groups, err = signal_groups("http://127.0.0.1:9", "+440000000000")
check("an unreachable bridge is reported, not raised", groups == [] and bool(err))
groups, err = signal_groups("", "")
check("missing bridge details are caught before calling", "Fill in" in (err or ""))

t = token(parent, "/parent/account")
r = parent.post("/parent/signal/groups",
                data={"_csrf": t, "api_url": "http://127.0.0.1:9", "number": "+440000000000"})
check("the group lookup endpoint answers with JSON",
      r.status_code == 200 and r.get_json().get("error"))
r = app.test_client().post("/parent/signal/groups", data={"api_url": "x", "number": "y"})
check("...and is not open to anyone logged out", r.status_code in (301, 302, 400))

check("compose drops empty lines",
      compose("a", None, "", "b") == "a\nb")

# a purchase notification should carry the detail a grown-up needs
with app.app_context():
    db = get_db()
    db.notifications.delete_many({})
    db.rewards.update_one({"title": "Sticker"},
                          {"$set": {"description": "One shiny sticker"}})
    sticker = db.rewards.find_one({"title": "Sticker"})
t = token(kidcli, "/me/shop")
kidcli.post(f"/me/shop/{sticker['_id']}/buy", data={"_csrf": t}, follow_redirects=True)
with app.app_context():
    n = get_db().notifications.find_one({"event": "approval_waiting"})
check("purchase alert names the child and the item",
      n and "Ava" in n["title"] and "Sticker" in n["title"], (n or {}).get("title"))
check("purchase alert gives cost, balance, description and what to do",
      n and all(x in n["body"] for x in ["Cost:", "points left", "One shiny sticker", "Given"]),
      (n or {}).get("body", "").replace("\n", " | "))

# and a quest completion should say which child did which quest. Use a fresh
# quest — the daily ones this child has already claimed today would be refused.
t = token(parent, "/parent/quests")
parent.post("/parent/quests", data={"_csrf": t, "title": "Feed the cat",
                                    "emoji": "\U0001f431", "points": "5",
                                    "repeat": "daily"}, follow_redirects=True)
with app.app_context():
    db = get_db()
    db.notifications.delete_many({})
    quest2 = db.quests.find_one({"title": "Feed the cat"})
t = token(kidcli, "/me/")
kidcli.post(f"/me/quests/{quest2['_id']}/done", data={"_csrf": t}, follow_redirects=True)
with app.app_context():
    n = get_db().notifications.find_one({"event": "approval_waiting"})
check("quest alert names the child and the quest",
      n and "Ava" in n["title"] and "Feed the cat" in n["title"], (n or {}).get("title"))
check("quest alert gives the points and how to pay out",
      n and "Worth 5 points" in n["body"] and "Approve" in n["body"],
      (n or {}).get("body", "").replace("\n", " | "))

print("\n--- quests you can do more than once ---")
t = token(parent, "/parent/quests")
parent.post("/parent/quests", data={"_csrf": t, "title": "Tidy up round", "emoji": "\U0001f9f9",
                                    "points": "3", "repeat": "daily",
                                    "times_per_period": "3"}, follow_redirects=True)
with app.app_context():
    tidy = get_db().quests.find_one({"title": "Tidy up round"})
check("times_per_period saved", tidy and tidy.get("times_per_period") == 3,
      str((tidy or {}).get("times_per_period")))

def claim(n):
    tk = token(kidcli, "/me/")
    return kidcli.post(f"/me/quests/{tidy['_id']}/done", data={"_csrf": tk},
                       follow_redirects=True)

for i in range(3):
    claim(i)
with app.app_context():
    n = get_db().quest_claims.count_documents({"quest_id": tidy["_id"], "kid_id": kid["_id"]})
check("a child can claim it three times in one day", n == 3, str(n))

r = claim(4)
with app.app_context():
    n = get_db().quest_claims.count_documents({"quest_id": tidy["_id"], "kid_id": kid["_id"]})
check("but not a fourth", n == 3, str(n))
check("and is told why", "the lot" in r.get_data(as_text=True).lower())

with app.app_context():
    db = get_db()
    seqs = sorted(c.get("seq") for c in
                  db.quest_claims.find({"quest_id": tidy["_id"], "kid_id": kid["_id"]}))
check("each claim got its own slot", seqs == [0, 1, 2], str(seqs))

# rejecting one should free a go without reusing the slot
with app.app_context():
    first = get_db().quest_claims.find_one({"quest_id": tidy["_id"], "seq": 0})
t = token(parent, "/parent/approvals")
parent.post(f"/parent/approvals/quest/{first['_id']}",
            data={"_csrf": t, "decision": "reject"}, follow_redirects=True)
claim(5)
with app.app_context():
    db = get_db()
    total = db.quest_claims.count_documents({"quest_id": tidy["_id"], "kid_id": kid["_id"]})
    live = db.quest_claims.count_documents({"quest_id": tidy["_id"], "kid_id": kid["_id"],
                                            "status": {"$in": ["pending", "approved"]}})
check("a rejected go can be redone", live == 3 and total == 4, f"live={live} total={total}")

# a plain once-a-day quest still behaves
t = token(parent, "/parent/quests")
parent.post("/parent/quests", data={"_csrf": t, "title": "Water the plants",
                                    "emoji": "\U0001f331", "points": "2",
                                    "repeat": "daily", "times_per_period": "1"},
            follow_redirects=True)
with app.app_context():
    once = get_db().quests.find_one({"title": "Water the plants"})
tk = token(kidcli, "/me/")
kidcli.post(f"/me/quests/{once['_id']}/done", data={"_csrf": tk}, follow_redirects=True)
tk = token(kidcli, "/me/")
r = kidcli.post(f"/me/quests/{once['_id']}/done", data={"_csrf": tk}, follow_redirects=True)
with app.app_context():
    n = get_db().quest_claims.count_documents({"quest_id": once["_id"], "kid_id": kid["_id"]})
check("a once-a-day quest is still once a day", n == 1, str(n))

check("the kid home page still renders", kidcli.get("/me/").status_code == 200)

print("\n--- quest descriptions and steps ---")
t = token(parent, "/parent/quests")
parent.post("/parent/quests", data={
    "_csrf": t, "title": "Clean the bathroom", "emoji": "\U0001f6c1", "points": "12",
    "repeat": "daily", "times_per_period": "1",
    "description": "Everything wiped and the floor dry",
    "subtasks": "Wipe the sink\nClean the mirror\n\nWipe the sink\nMop the floor"},
    follow_redirects=True)
with app.app_context():
    bath = get_db().quests.find_one({"title": "Clean the bathroom"})
check("description saved", (bath or {}).get("description") == "Everything wiped and the floor dry")
check("steps parsed, blanks and duplicates dropped",
      len((bath or {}).get("subtasks") or []) == 3,
      str([t_["text"] for t_ in (bath or {}).get("subtasks") or []]))
check("each step has an id",
      all(t_.get("id") for t_ in bath["subtasks"]))

# can't finish while steps are outstanding
tk = token(kidcli, "/me/")
r = kidcli.post(f"/me/quests/{bath['_id']}/done", data={"_csrf": tk}, follow_redirects=True)
with app.app_context():
    n = get_db().quest_claims.count_documents({"quest_id": bath["_id"], "kid_id": kid["_id"]})
check("can't finish a quest with steps outstanding", n == 0, str(n))
check("and is told how many are left", "step" in r.get_data(as_text=True).lower())

# tick them off
for step in bath["subtasks"]:
    tk = token(kidcli, "/me/")
    kidcli.post(f"/me/quests/{bath['_id']}/step/{step['id']}",
                data={"_csrf": tk}, follow_redirects=True)
with app.app_context():
    from app.models import quest_progress, period_key
    from datetime import datetime
    key = period_key("daily", datetime.now(app.config["TZINFO"]))
    done = quest_progress(get_db(), bath, kid, key)
check("all three steps ticked", len(done) == 3, str(len(done)))

# ticking again unticks
tk = token(kidcli, "/me/")
kidcli.post(f"/me/quests/{bath['_id']}/step/{bath['subtasks'][0]['id']}",
            data={"_csrf": tk}, follow_redirects=True)
with app.app_context():
    done = quest_progress(get_db(), bath, kid, key)
check("tapping a ticked step unticks it", len(done) == 2, str(len(done)))

tk = token(kidcli, "/me/")
kidcli.post(f"/me/quests/{bath['_id']}/step/{bath['subtasks'][0]['id']}",
            data={"_csrf": tk}, follow_redirects=True)
tk = token(kidcli, "/me/")
kidcli.post(f"/me/quests/{bath['_id']}/done", data={"_csrf": tk}, follow_redirects=True)
with app.app_context():
    db = get_db()
    n = db.quest_claims.count_documents({"quest_id": bath["_id"], "kid_id": kid["_id"]})
    done = quest_progress(db, bath, kid, key)
check("finishing works once every step is ticked", n == 1, str(n))
check("and the steps reset for the next go", len(done) == 0, str(len(done)))

# a bogus step id is ignored rather than stored
tk = token(kidcli, "/me/")
kidcli.post(f"/me/quests/{bath['_id']}/step/not-a-real-step",
            data={"_csrf": tk}, follow_redirects=True)
with app.app_context():
    done = quest_progress(get_db(), bath, kid, key)
check("an unknown step id is ignored", len(done) == 0, str(len(done)))

# editing keeps ids for lines that didn't change
t = token(parent, "/parent/quests")
parent.post(f"/parent/quests/{bath['_id']}", data={
    "_csrf": t, "action": "save", "title": "Clean the bathroom", "emoji": "\U0001f6c1",
    "points": "12", "repeat": "daily", "times_per_period": "1",
    "description": "Everything wiped and the floor dry",
    "subtasks": "Wipe the sink\nClean the mirror\nPolish the taps"},
    follow_redirects=True)
with app.app_context():
    after = get_db().quests.find_one({"_id": bath["_id"]})
before_ids = {t_["text"]: t_["id"] for t_ in bath["subtasks"]}
after_ids = {t_["text"]: t_["id"] for t_ in after["subtasks"]}
check("unchanged steps keep their ids",
      after_ids["Wipe the sink"] == before_ids["Wipe the sink"])
check("a new step gets a new id", "Polish the taps" in after_ids)
check("a removed step is gone", "Mop the floor" not in after_ids)

print("\n--- channel editing ---")
t = token(parent, "/parent/account")
parent.post(f"/parent/channels/{me['_id']}", data={
    "_csrf": t, "type": "ntfy", "ntfy__topic": "first-topic",
    "ntfy__server": "http://127.0.0.1:9"}, follow_redirects=True)
with app.app_context():
    ch = get_db().users.find_one({"_id": me["_id"]})["channels"][0]
t = token(parent, "/parent/account")
parent.post(f"/parent/channels/{me['_id']}/{ch['id']}/edit", data={
    "_csrf": t, "ntfy__topic": "second-topic", "ntfy__server": "",
    "events": ["approval_waiting"], "enabled": "1"}, follow_redirects=True)
with app.app_context():
    ch2 = get_db().users.find_one({"_id": me["_id"]})["channels"][0]
check("editing changes what was filled in", ch2["config"]["topic"] == "second-topic")
check("a blank field keeps the old value",
      ch2["config"]["server"] == "http://127.0.0.1:9", ch2["config"].get("server"))
check("event selection is saved", ch2["events"] == ["approval_waiting"], str(ch2["events"]))

t = token(parent, "/parent/account")
parent.post(f"/parent/channels/{me['_id']}/{ch['id']}/edit", data={
    "_csrf": t, "ntfy__topic": "second-topic"}, follow_redirects=True)
with app.app_context():
    ch3 = get_db().users.find_one({"_id": me["_id"]})["channels"][0]
check("a channel can be paused", ch3["enabled"] is False)

# and a grown-up can edit a child's channel, but not another grown-up's
with app.app_context():
    kid_ch = get_db().users.find_one({"_id": kid["_id"]})["channels"][0]
t = token(parent, "/parent/family")
parent.post(f"/parent/channels/{kid['_id']}/{kid_ch['id']}/edit", data={
    "_csrf": t, "signal__recipients": "group.NewGroup==", "enabled": "1"},
    follow_redirects=True)
with app.app_context():
    kid_ch2 = get_db().users.find_one({"_id": kid["_id"]})["channels"][0]
check("a grown-up can modify a child's channel",
      kid_ch2["config"]["recipients"] == "group.NewGroup==")

print("\n--- outbound requests identify themselves ---")
from app.notify import USER_AGENT
check("a User-Agent is set (Cloudflare 403s the default one)",
      USER_AGENT.startswith("Questly/"), USER_AGENT)

print("\n--- logout ---")
t = token(kidcli, "/me/")
r = kidcli.post("/logout", data={"_csrf": t}, follow_redirects=False)
check("logout redirects to who's here", r.headers.get("Location", "").endswith("/who"))
check("session really gone", kidcli.get("/me/", follow_redirects=False).status_code in (301, 302))

print("\n" + ("=" * 46))
print(f"FAILED: {len(FAILS)}" if FAILS else "ALL CHECKS PASSED")
for f in FAILS:
    print("  -", f)
sys.exit(1 if FAILS else 0)
