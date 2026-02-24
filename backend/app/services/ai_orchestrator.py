from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.repo import Repo
from app.domain.models import APIError, AIMessage, Topic
from app.integrations.llm_openai import generate_assistant_reply
from app.services.question_bank import next_question
from app.services.scoring import evaluate_user_message


def _extract_topic_id(db: Session, case) -> UUID | None:
    """
    case.topic expected like: 'alcohol'|'drugs'|'points'|'incident'
    If no matching Topic.slug exists, return None -> question_bank will fallback/random.
    """
    try:
        slug = (getattr(case, "topic", None) or "").strip().lower()
        if not slug:
            return None
        return db.scalar(select(Topic.id).where(Topic.slug == slug))
    except Exception:  # noqa: BLE001
        return None


def process_user_message(db: Session, session_id: UUID, user_content: str, locale: str, mode: str) -> AIMessage:
    """
    Orchestrates one chat step:
      - validate/normalize input
      - store user message
      - evaluate it (heuristic rubric) and persist evaluation
      - pick next question (mode + topic if available)
      - generate assistant reply (OpenAI or fallback)
      - store assistant message
      - return assistant AIMessage row

    Transaction management (commit/rollback) must be handled by the caller.
    """
    repo = Repo(db)

    sess = repo.get_ai_session(session_id)
    if not sess:
        raise APIError("NOT_FOUND", "Session not found", status_code=404)

    content = (user_content or "").strip()
    if not content:
        raise APIError("EMPTY_MESSAGE", "Message is empty", status_code=422)

    loc = (locale or "de").strip().lower()
    loc = "de" if loc.startswith("de") else "en"

    m = (mode or "").strip().lower()
    if m not in {"diagnostic", "practice", "mock"}:
        # route already нормализует, но оставляем guard на уровне сервиса
        raise APIError("BAD_MODE", "Invalid mode. Use: diagnostic, practice, mock", {"mode": mode}, status_code=422)

    # 1) Persist user message
    user_msg = repo.add_message(session_id, "user", content)

    # 2) Evaluate and persist evaluation for this user message
    ev = evaluate_user_message(content)
    repo.add_evaluation(
        session_id=session_id,
        message_id=user_msg.id,
        rubric_scores=ev.get("rubric_scores") or {},
        summary_feedback=str(ev.get("summary_feedback") or ""),
        detected_issues=ev.get("detected_issues") or {},
    )

    # 3) Pick next question (use route_case topic if it exists)
    topic_id: UUID | None = None
    try:
        case = repo.get_route_case(sess.user_id)
        if case:
            topic_id = _extract_topic_id(db, case)
    except Exception:  # noqa: BLE001
        topic_id = None

    question = next_question(db, locale=loc, mode=m, topic_id=topic_id)

    # 4) Generate assistant reply text
    assistant_text = generate_assistant_reply(mode=m, question=question, user_answer=content, locale=loc)

    # 5) Persist assistant message
    assistant_msg = repo.add_message(session_id, "assistant", assistant_text)
    return assistant_msg