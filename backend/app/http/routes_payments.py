from __future__ import annotations

import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.repo import Repo
from app.db.session import get_db
from app.deps import get_current_user
from app.domain.models import APIError, CheckoutIn, Order, PaymentEvent
from app.integrations.payments_stripe import StripeError, construct_event, create_checkout_session
from app.services.payments import apply_paid_event
from app.settings import settings

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.post("/checkout")
def checkout(payload: CheckoutIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    repo = Repo(db)

    product = repo.get_product(payload.product_id)
    if not product or not product.active:
        raise APIError("PRODUCT_NOT_FOUND", "Product not found", status_code=404)

    # provider_ref must be unique because of (provider, provider_ref) UNIQUE.
    # We'll replace this temp value with Stripe Checkout Session ID after creation.
    provider_ref_tmp = f"tmp_{uuid.uuid4().hex}"

    order = repo.create_order(user.id, product, provider_ref_tmp)
    order.provider = "stripe"
    order.status = "pending"

    try:
        session = create_checkout_session(
            secret_key=settings.stripe_secret_key,
            order_id=str(order.id),
            product_id=str(product.id),
            product_name=product.name_en if getattr(user, "locale", None) == "en" else product.name_de,
            unit_amount_cents=product.price_cents,
            currency=product.currency,
            stripe_price_id=product.stripe_price_id,
            frontend_url=settings.frontend_url,
            customer_email=user.email,
        )
    except StripeError as exc:
        db.rollback()
        raise APIError("CHECKOUT_FAILED", str(exc), status_code=502) from exc

    # Link order to Stripe session ID (stable unique provider ref)
    order.provider_ref = session["id"]
    db.commit()

    return {
        "data": {
            "order_id": str(order.id),
            "checkout_session_id": session["id"],
            "checkout_url": session.get("url"),
        }
    }


@router.post("/webhook")
async def webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
    db: Session = Depends(get_db),
):
    payload = await request.body()

    try:
        event = construct_event(
            payload=payload,
            signature_header=stripe_signature or "",
            webhook_secret=settings.stripe_webhook_secret,
        )
    except StripeError as exc:
        raise APIError("INVALID_SIGNATURE", str(exc), status_code=401) from exc

    repo = Repo(db)

    # Store event for audit + idempotency.
    # Repo.insert_payment_event() is race-safe; we still keep a defensive catch.
    try:
        evt, is_new = repo.insert_payment_event(
            "stripe",
            event["id"],
            event.get("type", "unknown"),
            event,
        )
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(PaymentEvent).where(PaymentEvent.event_id == event["id"]))
        if existing:
            return {"data": {"received": True, "deduplicated": True, "processed": False}}
        raise

    processed = False
    try:
        if is_new:
            etype = event.get("type")

            # Preferred signal: checkout.session.completed with metadata.order_id
            if etype == "checkout.session.completed":
                obj = (event.get("data") or {}).get("object") or {}
                meta = obj.get("metadata") or {}
                order_id = meta.get("order_id")

                # Only consider paid sessions
                if obj.get("payment_status") == "paid" and order_id:
                    order = db.get(Order, UUID(order_id))
                    if order and order.provider_ref:
                        # apply_paid_event is idempotent (skips if already paid)
                        apply_paid_event(db, order.provider_ref)
                        processed = True

        repo.mark_payment_event_processed(evt)
        db.commit()

    except APIError:
        db.rollback()
        raise
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise exc

    return {"data": {"received": True, "deduplicated": not is_new, "processed": processed}}
