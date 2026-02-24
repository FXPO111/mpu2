from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.repo import Repo
from app.db.session import get_db
from app.deps import get_current_user
from app.domain.models import APIError, MessageIn, SessionCreateIn
from app.services.ai_orchestrator import process_user_message

router = APIRouter(prefix="/api/ai", tags=["ai"])


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _norm_locale(locale: str) -> str:
    loc = (locale or "de").strip().lower()
    return "de" if loc.startswith("de") else "en"


def _norm_mode(mode: str) -> str:
    m = (mode or "").strip().lower()
    if m not in {"diagnostic", "practice", "mock"}:
        raise APIError("BAD_MODE", "Invalid mode. Use: diagnostic, practice, mock", {"mode": mode}, status_code=422)
    return m


@router.post("/sessions")
def create_session(payload: SessionCreateIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    repo = Repo(db)
    try:
        mode = _norm_mode(payload.mode)
        locale = _norm_locale(payload.locale)

        sess = repo.create_ai_session(user.id, mode, locale)
        db.commit()
        return {"data": {"id": str(sess.id), "mode": sess.mode, "locale": sess.locale, "status": sess.status}}
    except APIError:
        db.rollback()
        raise
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise exc


@router.get("/sessions/{session_id}")
def get_session(session_id: UUID, user=Depends(get_current_user), db: Session = Depends(get_db)):
    repo = Repo(db)
    sess = repo.get_ai_session(session_id)
    if not sess or sess.user_id != user.id:
        raise APIError("NOT_FOUND", "Session not found", status_code=404)
    return {"data": {"id": str(sess.id), "mode": sess.mode, "locale": sess.locale, "status": sess.status}}


@router.get("/sessions/{session_id}/messages")
def messages(session_id: UUID, user=Depends(get_current_user), db: Session = Depends(get_db)):
    repo = Repo(db)
    sess = repo.get_ai_session(session_id)
    if not sess or sess.user_id != user.id:
        raise APIError("NOT_FOUND", "Session not found", status_code=404)

    rows = repo.list_messages(session_id)
    return {
        "data": [
            {"id": str(m.id), "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()}
            for m in rows
        ]
    }


@router.post("/sessions/{session_id}/messages")
def send_message(session_id: UUID, payload: MessageIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    repo = Repo(db)
    sess = repo.get_ai_session(session_id)
    if not sess or sess.user_id != user.id:
        raise APIError("NOT_FOUND", "Session not found", status_code=404)

    if sess.status != "active":
        raise APIError("SESSION_CLOSED", "Session is closed", status_code=409)

    # ВАЖНО: нормализуем текст ДО кредитов
    content = (payload.content or "").strip()
    if not content:
        raise APIError("EMPTY_MESSAGE", "Message is empty", status_code=422)

    try:
        # Atomic consumption inside txn; will rollback on any failure below
        if not repo.consume_credit(user.id):
            raise APIError(
                "NO_CREDITS",
                "No AI credits left. Please buy an AI package.",
                {"pricing_url": "/pricing"},
                status_code=402,
            )

        # Передаем уже нормализованный контент
        assistant = process_user_message(db, session_id, content, sess.locale, sess.mode)
        db.commit()

        return {"data": {"assistant_message": {"id": str(assistant.id), "content": assistant.content}}}

    except APIError:
        db.rollback()
        raise
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise exc


@router.post("/sessions/{session_id}/close")
def close_session(session_id: UUID, user=Depends(get_current_user), db: Session = Depends(get_db)):
    repo = Repo(db)
    sess = repo.get_ai_session(session_id)
    if not sess or sess.user_id != user.id:
        raise APIError("NOT_FOUND", "Session not found", status_code=404)

    if sess.status != "active":
        return {"data": {"id": str(sess.id), "status": sess.status}}

    try:
        sess.status = "closed"
        if hasattr(sess, "closed_at"):
            sess.closed_at = _now_utc()
        db.commit()
        return {"data": {"id": str(sess.id), "status": "closed"}}
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise exc
