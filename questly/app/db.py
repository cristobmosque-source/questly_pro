"""MongoDB connection handling and index setup."""

from flask import current_app
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import PyMongoError


def init_mongo(app):
    """Attach a shared MongoClient to the app. Connection is lazy, so this
    never blocks on startup even if Mongo is not up yet."""
    app.extensions["mongo_client"] = MongoClient(
        app.config["MONGO_URI"],
        serverSelectionTimeoutMS=app.config["MONGO_TIMEOUT_MS"],
        tz_aware=True,
    )
    app.extensions["mongo_indexed"] = False


def get_db():
    db = current_app.extensions["mongo_client"][current_app.config["MONGO_DB"]]
    if not current_app.extensions.get("mongo_indexed"):
        try:
            ensure_indexes(db)
            current_app.extensions["mongo_indexed"] = True
        except PyMongoError:
            # Mongo not ready yet; try again on the next request.
            pass
    return db


def ensure_indexes(db):
    db.users.create_index([("role", ASCENDING), ("name", ASCENDING)])
    db.users.create_index(
        [("email", ASCENDING)],
        unique=True,
        partialFilterExpression={"email": {"$type": "string"}},
    )
    db.rewards.create_index([("active", DESCENDING), ("cost", ASCENDING)])
    db.transactions.create_index([("kid_id", ASCENDING), ("created_at", DESCENDING)])
    db.transactions.create_index([("created_at", DESCENDING)])
    db.redemptions.create_index([("status", ASCENDING), ("created_at", DESCENDING)])
    db.redemptions.create_index([("kid_id", ASCENDING), ("created_at", DESCENDING)])
    db.quests.create_index([("active", DESCENDING), ("title", ASCENDING)])
    db.quest_claims.create_index([("status", ASCENDING), ("created_at", DESCENDING)])
    db.quest_progress.create_index(
        [("quest_id", ASCENDING), ("kid_id", ASCENDING), ("period", ASCENDING)],
        unique=True,
    )
    db.quest_progress.create_index([("updated_at", ASCENDING)],
                                   expireAfterSeconds=90 * 24 * 60 * 60)

    db.notifications.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    db.notifications.create_index([("user_id", ASCENDING), ("read", ASCENDING)])
    # Keep the feed from growing forever; 90 days is plenty of history.
    db.notifications.create_index([("created_at", ASCENDING)],
                                  expireAfterSeconds=90 * 24 * 60 * 60)

    # A quest can be worth doing more than once a day, so uniqueness includes
    # an occurrence number. Two simultaneous claims race for the same slot and
    # one loses on the unique index, which is what keeps it honest.
    if "quest_id_1_kid_id_1_period_1" in db.quest_claims.index_information():
        db.quest_claims.drop_index("quest_id_1_kid_id_1_period_1")
    db.quest_claims.create_index(
        [("quest_id", ASCENDING), ("kid_id", ASCENDING),
         ("period", ASCENDING), ("seq", ASCENDING)],
        unique=True,
    )
    # At most one "missed" marker per quest, child and period — the model
    # checks first, and this index keeps a double tap honest.
    db.quest_claims.create_index(
        [("quest_id", ASCENDING), ("kid_id", ASCENDING), ("period", ASCENDING)],
        unique=True,
        partialFilterExpression={"status": "missed"},
    )
    # Bearer tokens for the JSON API live on the user's document.
    db.users.create_index(
        [("api_token", ASCENDING)],
        unique=True,
        partialFilterExpression={"api_token": {"$type": "string"}},
    )