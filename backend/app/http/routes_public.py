from secrets import token_urlsafe
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.repo import Repo
from app.db.session import get_db
from app.domain.models import APIError
from app.integrations.llm_openai import generate_therapy_reply
from app.integrations.payments_stripe import StripeError, create_checkout_session, is_stripe_configured
from app.security.auth import hash_password
from app.settings import settings

router = APIRouter(prefix="/api/public", tags=["public"])

PLAN_TO_PRODUCT_CODE: dict[str, str] = {
    "start": "PLAN_START",
    "pro": "PLAN_PRO",
    "intensive": "PLAN_INTENSIVE",
}


class DiagnosticSubmitIn(BaseModel):
    reasons: list[str] = Field(default_factory=list, min_length=1, max_length=2)
    other_reason: str | None = Field(default=None, max_length=120)
    situation: str = Field(min_length=12, max_length=2000)
    history: str = Field(min_length=12, max_length=2000)
    goal: str = Field(min_length=8, max_length=2000)


class DiagnosticSubmitOut(BaseModel):
    id: str
    recommended_plan: str


class PublicCheckoutIn(BaseModel):
    plan: Literal["start", "pro", "intensive"]
    email: str = Field(min_length=5, max_length=320)
    name: str | None = Field(default=None, max_length=120)
    success_url: str | None = Field(default=None, max_length=2000)
    cancel_url: str | None = Field(default=None, max_length=2000)


class PublicCheckoutOut(BaseModel):
    order_id: str
    checkout_session_id: str
    checkout_url: str | None


class PublicTherapyHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class PublicTherapyReplyIn(BaseModel):
    message: str = Field(min_length=2, max_length=8000)
    diagnostic_submission_id: str | None = Field(default=None)
    locale: str = Field(default="ru", max_length=5)
    history: list[PublicTherapyHistoryItem] = Field(default_factory=list, max_length=30)


class PublicTherapyReplyOut(BaseModel):
    reply: str
    plan: str
    risk_level: str


def detect_plan(payload: DiagnosticSubmitIn) -> str:
    text = " ".join(payload.reasons + [payload.other_reason or "", payload.situation, payload.history, payload.goal]).lower()
    intense_keywords = ["повтор", "отказ", "сложно", "долго", "стресс", "срочно", "конфликт", "инцидент"]
    pro_keywords = ["документ", "план", "трениров", "ошиб", "формулиров", "подготов"]

    if any(k in text for k in intense_keywords):
        return "intensive"
    if any(k in text for k in pro_keywords):
        return "pro"
    return "start"


def _safe_redirect_url(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip()
    if not candidate:
        return None
    if not (candidate.startswith("http://") or candidate.startswith("https://")):
        raise APIError("BAD_REDIRECT_URL", "Redirect URL must be absolute http(s) URL", status_code=422)
    return candidate


def _normalize_locale(locale: str) -> str:
    loc = (locale or "ru").strip().lower()
    if loc.startswith("de"):
        return "de"
    if loc.startswith("en"):
        return "en"
    return "ru"


@router.get("/expert")
def expert():
    return {
        "data": {
            "bio": "Certified MPU consultant",
            "languages": ["de", "en"],
            "city_for_offline": "Berlin",
            "pricing_summary": "AI packs + paid consultation slots",
        }
    }


@router.get("/products")
def products(db: Session = Depends(get_db)):
    repo = Repo(db)
    rows = repo.list_products()
    return {
        "data": [
            {"id": str(p.id), "code": p.code, "price_cents": p.price_cents, "currency": p.currency, "type": p.type}
            for p in rows
        ]
    }


@router.get("/slots")
def slots(db: Session = Depends(get_db)):
    repo = Repo(db)
    rows = repo.list_open_slots()
    return {
        "data": [
            {
                "id": str(s.id),
                "starts_at_utc": s.starts_at_utc.isoformat(),
                "duration_min": s.duration_min,
                "title": s.title,
            }
            for s in rows
        ]
    }


@router.post("/diagnostic", response_model=DiagnosticSubmitOut)
def submit_diagnostic(payload: DiagnosticSubmitIn, request: Request, db: Session = Depends(get_db)):
    recommended_plan = detect_plan(payload)
    row = Repo(db).create_diagnostic_submission(
        reasons=payload.reasons,
        other_reason=payload.other_reason,
        situation=payload.situation,
        history=payload.history,
        goal=payload.goal,
        recommended_plan=recommended_plan,
        meta_json={
            "source": "public_diagnostic",
            "ip": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
        },
    )
    db.commit()
    return DiagnosticSubmitOut(id=str(row.id), recommended_plan=row.recommended_plan)


@router.post("/therapy/reply", response_model=PublicTherapyReplyOut)
def public_therapy_reply(payload: PublicTherapyReplyIn, db: Session = Depends(get_db)):
    repo = Repo(db)

    diagnostic_context: dict[str, str | list[str]] = {
        "reasons": [],
        "goal": "",
        "situation": "",
        "history": "",
        "focus": ["Стабилизация", "Осознанность", "Ответственное поведение"],
    }
    plan = "start"
    risk_level = "moderate"

    if payload.diagnostic_submission_id:
        diag = None
        try:
            diag_id = UUID(payload.diagnostic_submission_id)
            diag = repo.get_diagnostic_submission(diag_id)
        except ValueError:
            diag = None

        if diag:
            diagnostic_context = {
                "reasons": diag.reasons,
                "goal": diag.goal,
                "situation": diag.situation,
                "history": diag.history,
                "focus": [
                    f"Триггер: {diag.reasons[0]}" if diag.reasons else "Стабилизация",
                    f"Цель: {diag.goal[:160]}",
                    "Снижение риска срыва",
                ],
            }
            plan = diag.recommended_plan
            risk_level = "high" if len(diag.history or "") > 160 else "moderate"

    reply = generate_therapy_reply(
        locale=_normalize_locale(payload.locale),
        diagnostic_context=diagnostic_context,
        history=[m.model_dump() for m in payload.history],
        user_message=payload.message,
    )

    return PublicTherapyReplyOut(reply=reply, plan=plan, risk_level=risk_level)


@router.post("/checkout", response_model=PublicCheckoutOut)
def public_checkout(payload: PublicCheckoutIn, db: Session = Depends(get_db)):
    repo = Repo(db)
    product_code = PLAN_TO_PRODUCT_CODE[payload.plan]
    product = repo.get_product_by_code(product_code)
    if not product:
        raise APIError(
            "PRODUCT_NOT_FOUND",
            "Product is not configured",
            {"expected_codes": sorted(PLAN_TO_PRODUCT_CODE.values())},
            status_code=404,
        )

    if not is_stripe_configured(settings.stripe_secret_key):
        raise APIError("STRIPE_NOT_CONFIGURED", "Stripe keys are missing", status_code=503)

    user = repo.get_user_by_email(payload.email)
    if not user:
        name = (payload.name or payload.email.split("@")[0] or "Client")[:120]
        user = repo.create_user(
            email=payload.email,
            password_hash=hash_password(token_urlsafe(24)),
            name=name,
            locale="de",
        )

    order = repo.create_order(user.id, product, provider_ref=f"tmp_{token_urlsafe(18)}")
    order.provider = "stripe"
    order.status = "pending"

    try:
        session = create_checkout_session(
            secret_key=settings.stripe_secret_key,
            order_id=str(order.id),
            product_id=str(product.id),
            product_name=product.name_de,
            unit_amount_cents=product.price_cents,
            currency=product.currency,
            stripe_price_id=product.stripe_price_id,
            frontend_url=settings.frontend_url,
            customer_email=user.email,
            success_url_override=_safe_redirect_url(payload.success_url),
            cancel_url_override=_safe_redirect_url(payload.cancel_url),
        )
    except StripeError as exc:
        db.rollback()
        raise APIError("CHECKOUT_FAILED", "Stripe checkout failed", status_code=502) from exc

    order.provider_ref = session["id"]
    db.commit()

    return PublicCheckoutOut(
        order_id=str(order.id),
        checkout_session_id=session["id"],
        checkout_url=session.get("url"),
    )