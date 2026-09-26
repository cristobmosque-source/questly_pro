"""Unit tests for the custom_days recurrence and missed-quest penalties.

Runs without a real MongoDB: the model layer is exercised against mongomock.

    pip install mongomock
    python tests/test_quest_days_and_missed.py
"""
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import mongomock
from bson import ObjectId

from app.models import (claim_quest, create_kid, decide_quest_claim,
                        history_for, mark_quest_missed, period_key,
                        quests_for_kid, retract_quest_claim)

FAILS = []


def check(label, cond, extra=""):
    print(("  PASS  " if cond else "  FAIL  ") + label
          + (f"   [{extra}]" if extra and not cond else ""))
    if not cond:
        FAILS.append(label)


TZ = ZoneInfo("America/Santiago")
MON = datetime(2026, 9, 21, 15, 0, tzinfo=TZ)      # lunes
TUE = datetime(2026, 9, 22, 15, 0, tzinfo=TZ)      # martes
NEXT_MON = datetime(2026, 9, 28, 15, 0, tzinfo=TZ)
SAT = datetime(2026, 9, 26, 15, 0, tzinfo=TZ)      # sábado

DAD = {"_id": ObjectId(), "name": "Dad"}


def fresh_db():
    return mongomock.MongoClient().questly_test


def add_kid(db, name, points=0):
    return db.users.find_one({"_id": create_kid(db, name, "\U0001f98a", "#7c4dff",
                                                points=points)})


def add_quest(db, title="Quest", points=10, repeat="daily",
              times_per_period=1, repeat_days=None, assigned_to=None):
    doc = {
        "title": title, "emoji": "\u2b50", "points": points, "repeat": repeat,
        "times_per_period": times_per_period, "subtasks": [],
        "assigned_to": assigned_to or [], "active": True,
    }
    if repeat_days is not None:
        doc["repeat_days"] = repeat_days
    doc["_id"] = db.quests.insert_one(doc).inserted_id
    return doc


def balance(db, kid):
    return db.users.find_one({"_id": kid["_id"]})["points"]


print("--- period_key buckets ---")
check("custom_days: one bucket per local date",
      period_key("custom_days", MON) == "2026-09-21"
      and period_key("custom_days", TUE) == "2026-09-22")
check("daily: unchanged date bucket", period_key("daily", MON) == "2026-09-21")
check("weekly: unchanged week bucket", period_key("weekly", MON) == "2026-W39")
check("once: still 'once'", period_key("once", MON) == "once")

print("\n--- custom_days visibility ---")
db = fresh_db()
kid = add_kid(db, "Samuel")
bed = add_quest(db, title="Make the bed", repeat="custom_days",
                repeat_days=[0, 1, 2, 3, 4])
check("appears on a selected day (Monday)",
      any(q["_id"] == bed["_id"] for q in quests_for_kid(db, kid, MON)))
check("hidden on an unselected day (Saturday)",
      not any(q["_id"] == bed["_id"] for q in quests_for_kid(db, kid, SAT)))

print("\n--- custom_days claims ---")
c1, err = claim_quest(db, bed, kid, MON)
check("can claim on Monday", err is None, str(err))
decide_quest_claim(db, c1["_id"], "approve", DAD)
c2, err = claim_quest(db, bed, kid, TUE)
check("completing Monday doesn't block Tuesday", err is None, str(err))
_, err = claim_quest(db, bed, kid, TUE)
check("times_per_period still applies within one day (limit 1)", err is not None)

print("\n--- existing recurrences keep working ---")
once = add_quest(db, title="One-off", repeat="once")
_, err = claim_quest(db, once, kid, MON)
check("once: claimable the first time", err is None, str(err))
_, err = claim_quest(db, once, kid, TUE)
check("once: never again", err is not None)

daily = add_quest(db, title="Feed the cat", repeat="daily")
_, err = claim_quest(db, daily, kid, MON)
check("daily: claimable today", err is None, str(err))
_, err = claim_quest(db, daily, kid, MON)
check("daily: once per day", err is not None)
_, err = claim_quest(db, daily, kid, TUE)
check("daily: fresh again tomorrow", err is None, str(err))

weekly = add_quest(db, title="Take out the bins", repeat="weekly")
_, err = claim_quest(db, weekly, kid, MON)
check("weekly: claimable this week", err is None, str(err))
_, err = claim_quest(db, weekly, kid, TUE)
check("weekly: once per week", err is not None)
_, err = claim_quest(db, weekly, kid, NEXT_MON)
check("weekly: fresh next week", err is None, str(err))

print("\n--- assigned_to still works ---")
ana = add_kid(db, "Ana")
mine = add_quest(db, title="Ana's quest", assigned_to=[ana["_id"]])
check("assigned kid sees the quest",
      any(q["_id"] == mine["_id"] for q in quests_for_kid(db, ana, MON)))
check("other kid doesn't see it",
      not any(q["_id"] == mine["_id"] for q in quests_for_kid(db, kid, MON)))
check("unassigned quests are for everyone",
      any(q["_id"] == daily["_id"] for q in quests_for_kid(db, ana, MON)))

print("\n--- missed penalties ---")
db = fresh_db()
kid = add_kid(db, "Samuel", points=100)

dish = add_quest(db, title="Dish duty", repeat="daily", points=10)
claim, err = mark_quest_missed(db, dish, kid, MON, DAD)
check("a daily quest can be marked as missed", err is None, str(err))
check("10 points -> -5 penalty", claim and claim["penalty"] == -5)
check("balance drops immediately", balance(db, kid) == 95)

piano = add_quest(db, title="Piano practice", repeat="custom_days",
                  repeat_days=[1], points=20)
claim, err = mark_quest_missed(db, piano, kid, TUE, DAD)
check("a custom_days quest can be marked as missed", err is None, str(err))
check("20 points -> -10 penalty", claim and claim["penalty"] == -10)

odd = add_quest(db, title="Odd quest", repeat="daily", points=15)
claim, err = mark_quest_missed(db, odd, kid, MON, DAD)
check("15 points -> -7.5 penalty (decimal kept)",
      claim and claim["penalty"] == -7.5)
check("balance is 77.5", balance(db, kid) == 77.5)

_, err = mark_quest_missed(db, odd, kid, MON, DAD)
check("same quest+kid+period can't be penalised twice", err is not None)

hist = history_for(db, kid["_id"])
missed_rows = [h for h in hist if h["kind"] == "missed"]
check("penalty is recorded in the history", len(missed_rows) == 3)
check("penalty transactions are negative",
      all(h["delta"] < 0 for h in missed_rows))
check("penalty is exactly half the quest points",
      sorted(h["delta"] for h in missed_rows) == [-10, -7.5, -5])

claim_row = db.quest_claims.find_one({"quest_id": odd["_id"], "status": "missed"})
check("missed claim records who/when/what",
      claim_row["applied_by"] == DAD["_id"] and claim_row["decided_by"] == "Dad"
      and claim_row["period"] == "2026-09-21" and claim_row["points"] == 15)

print("\n--- missed closes the period, rejected doesn't ---")
state = {q["_id"]: q for q in quests_for_kid(db, kid, MON)}
check("a missed quest is closed for that period",
      state[odd["_id"]]["state"] == "missed")
_, err = claim_quest(db, odd, kid, MON)
check("kid can't claim a missed quest in that period", err is not None)
_, err = claim_quest(db, odd, kid, TUE)
check("the next day it opens again", err is None, str(err))

decided = decide_quest_claim(db, claim_row["_id"], "approve", DAD)
check("a missed claim is not approvable like a pending one", decided is None)
check("trying to approve a missed claim changes nothing",
      balance(db, kid) == 77.5
      and db.quest_claims.find_one({"_id": claim_row["_id"]})["status"] == "missed")

halfway = add_quest(db, title="Halfway", repeat="daily", points=10)
c, err = claim_quest(db, halfway, kid, MON)
check("kid can still claim normally", err is None, str(err))
claim = decide_quest_claim(db, c["_id"], "partial", DAD)
check("half-done pays exactly 25% (10 -> 2.5)",
      claim and claim["awarded"] == 2.5)
check("balance after a halfway verdict is 80", balance(db, kid) == 80)
state = {q["_id"]: q for q in quests_for_kid(db, kid, MON)}
check("a halfway verdict closes the quest for the day",
      state[halfway["_id"]]["state"] == "done")
_, err = claim_quest(db, halfway, kid, MON)
check("kid can't claim a halfway-paid quest again", err is not None)

lied = add_quest(db, title="Said it was done", repeat="daily", points=10)
c, err = claim_quest(db, lied, kid, MON)
claim = decide_quest_claim(db, c["_id"], "not_done", DAD)
check("claimed-but-not-done costs 50% (10 -> -5)",
      claim and claim["penalty"] == -5)
check("balance after not_done is 75", balance(db, kid) == 75)
state = {q["_id"]: q for q in quests_for_kid(db, kid, MON)}
check("a not_done quest is closed (missed)",
      state[lied["_id"]]["state"] == "missed")
check("the grown-up's verdict can't be redone",
      decide_quest_claim(db, c["_id"], "approve", DAD) is None)
check("retracting after a verdict changes nothing",
      retract_quest_claim(db, lied, kid, MON) is None
      and balance(db, kid) == 75)

approved = add_quest(db, title="Good job", repeat="daily", points=10)
c, err = claim_quest(db, approved, kid, MON)
decide_quest_claim(db, c["_id"], "approve", DAD)
check("done properly still pays 100% (75 -> 85)", balance(db, kid) == 85)

odd_verdict = add_quest(db, title="Bad verdict", repeat="daily", points=10)
c, err = claim_quest(db, odd_verdict, kid, MON)
check("an unknown verdict is refused",
      decide_quest_claim(db, c["_id"], "reject", DAD) is None)
check("a refused verdict leaves it pending and pays nothing",
      balance(db, kid) == 85)
claim = decide_quest_claim(db, c["_id"], "approve", DAD)
check("it can then be approved normally (85 -> 95)",
      claim is not None and balance(db, kid) == 95)

print("\n--- kid retraction: 0%, back to open ---")
takeback = add_quest(db, title="Take back", repeat="daily", points=10)
c, err = claim_quest(db, takeback, kid, MON)
check("claims before retracting", err is None, str(err))
hist_before = len(history_for(db, kid["_id"], limit=100))
claim = retract_quest_claim(db, takeback, kid, MON)
check("a pending claim can be retracted", claim is not None)
check("retraction pays and takes nothing", balance(db, kid) == 95)
check("retraction writes no transaction",
      len(history_for(db, kid["_id"], limit=100)) == hist_before)
state = {q["_id"]: q for q in quests_for_kid(db, kid, MON)}
check("a retracted quest is open again",
      state[takeback["_id"]]["state"] == "open")
again, err = claim_quest(db, takeback, kid, MON)
check("kid can claim again after retracting", err is None, str(err))
check("redoing it properly pays 100%",
      decide_quest_claim(db, again["_id"], "approve", DAD)
      and balance(db, kid) == 105)
check("nothing pending means nothing to retract",
      retract_quest_claim(db, takeback, kid, MON) is None)

print("\n--- guards ---")
bins = add_quest(db, title="Weekly chore", repeat="weekly")
_, err = mark_quest_missed(db, bins, kid, MON, DAD)
check("weekly quests can't be marked as missed", err is not None)
oneoff2 = add_quest(db, title="Single", repeat="once")
_, err = mark_quest_missed(db, oneoff2, kid, MON, DAD)
check("once quests can't be marked as missed", err is not None)
tuesday_only = add_quest(db, title="Tue only", repeat="custom_days",
                         repeat_days=[1])
_, err = mark_quest_missed(db, tuesday_only, kid, MON, DAD)
check("can't be missed on an unscheduled day", err is not None)
claimed = add_quest(db, title="Already sent in", repeat="daily")
claim_quest(db, claimed, kid, MON)
_, err = mark_quest_missed(db, claimed, kid, MON, DAD)
check("can't be missed when a claim is already waiting", err is not None)

print()
if FAILS:
    print(f"{len(FAILS)} check(s) FAILED:")
    for f in FAILS:
        print("  - " + f)
    sys.exit(1)
print("All checks passed.")