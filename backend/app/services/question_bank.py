from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.models import Question

# Level bands per mode (MVP heuristic)
_MODE_LEVELS = {
    "diagnostic": (1, 2),  # проще, чтобы собрать базовый кейс
    "practice": (2, 4),    # тренировка
    "mock": (2, 5),        # ближе к реальному
}


def _normalize_locale(locale: str) -> str:
    loc = (locale or "de").lower().strip()
    return "de" if loc.startswith("de") else "en"


def _fallback_question(locale: str, mode: str | None) -> str:
    locale = _normalize_locale(locale)
    if locale == "de":
        if mode == "mock":
            return "Bitte fassen Sie Ihren Fall in 2–3 Sätzen zusammen (Fakten, Daten, Ihr Anteil)."
        if mode == "practice":
            return "Was genau ist passiert (wann, wo, mit wem) und welche Verantwortung tragen Sie?"
        return "Bitte schildern Sie kurz Ihre aktuelle Situation rund um das MPU-Thema."
    else:
        if mode == "mock":
            return "Please summarize your case in 2–3 sentences (facts, dates, your role)."
        if mode == "practice":
            return "What exactly happened (when, where, with whom) and what responsibility do you take?"
        return "Please briefly describe your current situation related to the MPU topic."


def _pick_question(
    db: Session,
    *,
    mode: str | None,
    topic_id: UUID | None,
    level_min: int | None,
    level_max: int | None,
) -> Question | None:
    stmt = select(Question)

    if topic_id is not None:
        stmt = stmt.where(Question.topic_id == topic_id)

    # Apply level constraints with sane defaults by mode
    if (level_min is None or level_max is None) and mode in _MODE_LEVELS:
        lm, lx = _MODE_LEVELS[mode]
        level_min = lm if level_min is None else level_min
        level_max = lx if level_max is None else level_max

    if level_min is not None:
        stmt = stmt.where(Question.level >= int(level_min))
    if level_max is not None:
        stmt = stmt.where(Question.level <= int(level_max))

    # Random pick within constraints
    stmt = stmt.order_by(func.random()).limit(1)

    q = db.scalar(stmt)
    return q


def next_question(
    db: Session,
    locale: str = "de",
    *,
    mode: str | None = None,
    topic_id: UUID | None = None,
    level_min: int | None = None,
    level_max: int | None = None,
) -> str:
    """
    Returns next question text (DE/EN).

    Backward compatible:
      - existing calls: next_question(db, locale="de") still work.

    Optional controls:
      - mode: diagnostic|practice|mock
      - topic_id: pick from a topic
      - level_min/level_max: override difficulty band
    """
    loc = _normalize_locale(locale)
    mode_norm = (mode or "").strip().lower() or None

    q = _pick_question(
        db,
        mode=mode_norm,
        topic_id=topic_id,
        level_min=level_min,
        level_max=level_max,
    )

    # Widen constraints progressively if nothing found
    if not q and topic_id is not None:
        q = _pick_question(db, mode=mode_norm, topic_id=None, level_min=level_min, level_max=level_max)

    if not q and (level_min is not None or level_max is not None):
        q = _pick_question(db, mode=mode_norm, topic_id=topic_id, level_min=None, level_max=None)

    if not q:
        return _fallback_question(loc, mode_norm)

    text = q.question_de if loc == "de" else q.question_en
    return text or _fallback_question(loc, mode_norm)
