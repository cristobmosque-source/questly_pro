"""Notifications.

Everything worth telling someone about is recorded in-app first — that always
works, needs no setup, and no permissions. On top of that, each person can
have any number of delivery channels (ntfy on a tablet, Signal for a parent),
so a young child gets in-app only while an older one gets a push.

Outbound sends happen on a small background pool: a slow or dead endpoint must
never hold up the request that triggered it. Nothing here touches the Flask
app context, so it is safe off-thread — callers pass in plain data.
"""

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from .version import __version__

log = logging.getLogger(__name__)

_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="questly-notify")
# signal-cli in "normal" mode starts a JVM per request; a cold first call can
# take well over ten seconds.
TIMEOUT = int(os.environ.get("NOTIFY_TIMEOUT", "30"))


# ---------------------------------------------------------------------------
# what can happen
# ---------------------------------------------------------------------------

EVENTS = {
    # for children
    "shop_new":          {"who": "kid",    "label": "Something new in the shop", "icon": "\U0001f6cd️"},
    "points_awarded":    {"who": "kid",    "label": "I get points",              "icon": "⭐"},
    "purchase_approved": {"who": "kid",    "label": "My reward is ready",        "icon": "\U0001f389"},
    "purchase_rejected": {"who": "kid",    "label": "A purchase was turned down","icon": "↩️"},
    "quest_approved":    {"who": "kid",    "label": "A quest was approved",      "icon": "✅"},
    "quest_rejected":    {"who": "kid",    "label": "A quest was sent back",     "icon": "\U0001f504"},
    "goal_reached":      {"who": "kid",    "label": "I can afford what I'm saving for", "icon": "\U0001f3af"},
    # for grown-ups
    "approval_waiting":  {"who": "parent", "label": "Something needs approving", "icon": "⏳"},
}


def events_for(role):
    return {k: v for k, v in EVENTS.items() if v["who"] == role}


# ---------------------------------------------------------------------------
# where it can go
# ---------------------------------------------------------------------------

USER_AGENT = f"Questly/{__version__} (+https://github.com/mahansford/questly)"


def _post(url, data, headers=None, method="POST"):
    body = data if isinstance(data, bytes) else json.dumps(data).encode()
    sent = {"Content-Type": "application/json"}
    sent.update(headers or {})
    # Discord sits behind Cloudflare, which answers the default urllib
    # User-Agent with a 403 (error 1010) before the request ever reaches the
    # API. Every service gets a proper one.
    sent.setdefault("User-Agent", USER_AGENT)
    req = urllib.request.Request(url, data=body, method=method, headers=sent)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.status


def _send_ntfy(cfg, title, body):
    server = (cfg.get("server") or "https://ntfy.sh").rstrip("/")
    headers = {"Title": title.encode("utf-8").decode("latin-1", "ignore"),
               "Content-Type": "text/plain; charset=utf-8"}
    if cfg.get("token"):
        headers["Authorization"] = f"Bearer {cfg['token']}"
    return _post(f"{server}/{cfg['topic']}", body.encode("utf-8"), headers)


def _send_signal(cfg, title, body):
    """Signal has no public API; this talks to a self-hosted
    signal-cli-rest-api. Recipients may be phone numbers or `group.<id>`."""
    api = (cfg.get("api_url") or "").rstrip("/")
    recipients = [r.strip() for r in (cfg.get("recipients") or "").split(",") if r.strip()]
    return _post(f"{api}/v2/send", {
        # Signal's own emphasis syntax; the bridge renders it when styled.
        "message": f"*{title}*\n{body}",
        "number": cfg.get("number"),
        "recipients": recipients,
        "text_mode": "styled",
    })


def signal_groups(api_url, number):
    """Ask the bridge which groups this number is in, so a grown-up can pick
    one instead of hunting for a base64 group id. Returns (groups, error)."""
    api = (api_url or "").rstrip("/")
    if not api or not number:
        return [], "Fill in the bridge URL and your Signal number first."
    url = f"{api}/v1/groups/{urllib.parse.quote(number)}"
    try:
        req = urllib.request.Request(url, method="GET",
                                     headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = json.loads(r.read().decode() or "[]")
    except urllib.error.HTTPError as exc:
        return [], f"The bridge said HTTP {exc.code}. Is that number registered?"
    except urllib.error.URLError as exc:
        return [], f"Couldn't reach the bridge: {exc.reason}"
    except Exception as exc:                                # noqa: BLE001
        return [], str(exc)

    if isinstance(data, dict):                # some builds wrap the list
        data = data.get("groups", [])

    groups = []
    for g in data:
        if not isinstance(g, dict):
            continue
        gid = g.get("id") or g.get("internal_id")
        if gid:
            groups.append({"id": gid, "name": g.get("name") or "(unnamed group)"})

    if groups:
        return sorted(groups, key=lambda g: g["name"].lower()), None
    return [], _no_groups_hint(api, len(data))


def _no_groups_hint(api, raw_count):
    """An empty group list is nearly always a sync problem rather than a real
    absence of groups, so say which, and what to do about it."""
    if raw_count:
        return (f"The bridge returned {raw_count} group(s) but none had an id "
                "Questly could use — check the bridge version.")

    mode = None
    try:
        req = urllib.request.Request(f"{api}/v1/about", method="GET",
                                     headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            mode = (json.loads(r.read().decode() or "{}") or {}).get("mode")
    except Exception:                                       # noqa: BLE001
        pass

    if mode in ("normal", "native"):
        return (f"No groups yet. In {mode} mode the bridge only learns about "
                "groups when something calls receive — nothing has yet. Call "
                "/v1/receive/<your number> once, or set MODE=json-rpc on the "
                "bridge so it stays synced.")
    return ("No groups found. If you've only just linked this number, the "
            "bridge may not have synced yet — try again shortly.")


def _send_gotify(cfg, title, body):
    server = (cfg.get("server") or "").rstrip("/")
    return _post(f"{server}/message?token={cfg.get('token')}",
                 {"title": title, "message": body, "priority": 5})


def _send_telegram(cfg, title, body):
    return _post(f"https://api.telegram.org/bot{cfg.get('token')}/sendMessage",
                 {"chat_id": cfg.get("chat_id"), "text": f"{title}\n{body}"})


def _send_discord(cfg, title, body):
    return _post(cfg.get("webhook_url"), {"content": f"**{title}**\n{body}"})


def _send_pushover(cfg, title, body):
    payload = urllib.parse.urlencode({
        "token": cfg.get("token"), "user": cfg.get("user_key"),
        "title": title, "message": body}).encode()
    return _post("https://api.pushover.net/1/messages.json", payload,
                 {"Content-Type": "application/x-www-form-urlencoded"})


def _send_webhook(cfg, title, body):
    return _post(cfg.get("url"), {"title": title, "body": body})


CHANNELS = {
    "ntfy": {
        "label": "ntfy", "icon": "\U0001f4f2", "send": _send_ntfy,
        "blurb": "Free push to the ntfy app on a phone or tablet. Good for kids — "
                 "they just subscribe to a topic, no account needed.",
        "fields": [
            ("topic",  "Topic",  "text", True,  "questly-ava-8f3k", "Make it hard to guess: anyone who knows it can read the messages."),
            ("server", "Server", "text", False, "https://ntfy.sh", "Leave blank for the public ntfy.sh, or point at your own."),
            ("token",  "Access token", "password", False, "", "Only if your server requires auth."),
        ],
    },
    "signal": {
        "label": "Signal", "icon": "\U0001f512", "send": _send_signal,
        "blurb": "Signal has no public API, so this posts to a self-hosted "
                 "signal-cli-rest-api bridge (available in Unraid Community Apps).",
        "fields": [
            ("api_url",    "Bridge URL", "text", True, "http://192.168.1.50:8080", "Where signal-cli-rest-api is listening."),
            ("number",     "Send from",  "text", True, "+447700900000", "The registered Signal number, in international format."),
            ("recipients", "Send to",    "text", True, "+447700900001", "Phone numbers and/or group ids, comma-separated. Use Find my groups to pick one."),
        ],
    },
    "gotify": {
        "label": "Gotify", "icon": "\U0001f4ec", "send": _send_gotify,
        "blurb": "Self-hosted push server with Android and web clients.",
        "fields": [
            ("server", "Server URL",  "text", True, "http://192.168.1.50:8080", ""),
            ("token",  "App token",   "password", True, "", "From Gotify's Apps page."),
        ],
    },
    "telegram": {
        "label": "Telegram", "icon": "✈️", "send": _send_telegram,
        "blurb": "Messages from a bot you create with @BotFather.",
        "fields": [
            ("token",   "Bot token", "password", True, "", "From @BotFather."),
            ("chat_id", "Chat ID",   "text",     True, "", "Your own chat, or a group's id."),
        ],
    },
    "discord": {
        "label": "Discord", "icon": "\U0001f4ac", "send": _send_discord,
        "blurb": "Posts into a Discord channel via a webhook. Slack-style "
                 "webhooks work too if they accept a `content` field.",
        "fields": [
            ("webhook_url", "Webhook URL", "text", True, "", "Channel settings \u2192 Integrations \u2192 Webhooks. Treat it as a secret: anyone with it can post."),
        ],
    },
    "pushover": {
        "label": "Pushover", "icon": "\U0001f514", "send": _send_pushover,
        "blurb": "Paid one-off app for iOS and Android.",
        "fields": [
            ("token",    "API token", "password", True, "", "From your Pushover application."),
            ("user_key", "User key",  "password", True, "", "From your Pushover dashboard."),
        ],
    },
    "webhook": {
        "label": "Webhook", "icon": "\U0001f517", "send": _send_webhook,
        "blurb": "Posts {\"title\", \"body\"} as JSON anywhere you like — "
                 "Home Assistant, Node-RED, your own script.",
        "fields": [
            ("url", "URL", "text", True, "http://192.168.1.50:1880/questly", ""),
        ],
    },
}


def channel_summary(channel):
    """One-line description for the settings list, never showing a secret."""
    spec = CHANNELS.get(channel.get("type"))
    if not spec:
        return channel.get("type", "unknown")
    cfg = channel.get("config", {})
    for key in ("topic", "recipients", "chat_id", "url", "server", "api_url"):
        if cfg.get(key):
            return f"{spec['label']} → {cfg[key]}"
    return spec["label"]


# ---------------------------------------------------------------------------
# sending
# ---------------------------------------------------------------------------

def deliver(channel, title, body):
    """Push to one channel. Returns (ok, message). Safe to call off-thread."""
    spec = CHANNELS.get(channel.get("type"))
    if not spec:
        return False, f"Unknown channel type {channel.get('type')!r}"
    try:
        status = spec["send"](channel.get("config", {}), title, body)
        return True, f"HTTP {status}"
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code} from the service"
    except urllib.error.URLError as exc:
        return False, f"Couldn't reach it: {exc.reason}"
    except Exception as exc:                                # noqa: BLE001
        return False, str(exc)


def _deliver_quietly(channel, title, body):
    ok, detail = deliver(channel, title, body)
    if not ok:
        log.warning("notification via %s failed: %s", channel.get("type"), detail)


def compose(*lines):
    """Join the non-empty lines of a message body.

    Kept deliberately plain: ntfy, Gotify and Telegram show it as-is, while
    Signal and Discord add their own emphasis to the title around it.
    """
    return "\n".join(str(l) for l in lines if l)


def notify(db, user, event, title, body, url=None):
    """Record a notification and fan it out to that person's channels.

    `user` may be a user document or an id. Storing is synchronous and quick;
    outbound delivery is handed to the background pool.
    """
    if event not in EVENTS:
        raise ValueError(f"unknown event {event!r}")

    if not isinstance(user, dict):
        user = db.users.find_one({"_id": user})
    if not user:
        return None

    doc = {
        "user_id": user["_id"],
        "event": event,
        "title": title,
        "body": body,
        "url": url,
        "read": False,
        "created_at": datetime.now(timezone.utc),
    }
    db.notifications.insert_one(doc)

    for channel in user.get("channels", []):
        if not channel.get("enabled", True):
            continue
        wanted = channel.get("events")
        if wanted and event not in wanted:
            continue
        _pool.submit(_deliver_quietly, channel, title, body)

    return doc


def notify_many(db, users, event, title, body, url=None):
    for user in users:
        notify(db, user, event, title, body, url)


# ---------------------------------------------------------------------------
# reading
# ---------------------------------------------------------------------------

def unread_count(db, user_id):
    return db.notifications.count_documents({"user_id": user_id, "read": False})


def recent(db, user_id, limit=50):
    return list(db.notifications.find({"user_id": user_id})
                .sort("created_at", -1).limit(limit))


def mark_all_read(db, user_id):
    db.notifications.update_many({"user_id": user_id, "read": False},
                                 {"$set": {"read": True}})
