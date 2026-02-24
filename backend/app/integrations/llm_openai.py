from __future__ import annotations

import os
from typing import Any

from app.settings import settings

DEFAULT_MODEL = os.getenv("OPENAI_MODEL") or "gpt-4o-mini"


def _has_openai() -> bool:
    return bool(getattr(settings, "openai_api_key", None))


def _fallback(*, mode: str, question: str, locale: str) -> str:
    loc = (locale or "de").strip().lower()
    if loc.startswith("de"):
        if mode == "mock":
            return f"Feedback: Bitte mehr Fakten (wann/wo/was genau) und mehr Eigenverantwortung.\nNächste Frage: {question}"
        return f"Feedback: Bitte konkreter werden und Verantwortung klar benennen.\nNächste Frage: {question}"
    else:
        if mode == "mock":
            return f"Feedback: Add concrete facts (when/where/what) and your responsibility.\nNext question: {question}"
        return f"Feedback: Be more specific and take responsibility.\nNext question: {question}"


def generate_assistant_reply(*, mode: str, question: str, user_answer: str, locale: str = "de") -> str:
    """
    Generates assistant text. If OPENAI_API_KEY is missing or OpenAI SDK call fails, returns deterministic fallback.
    """
    if not _has_openai():
        return _fallback(mode=mode, question=question, locale=locale)

    loc = (locale or "de").strip().lower()
    if loc.startswith("de"):
        system = (
            "Du bist ein strenger MPU-Interview-Trainer. "
            "Deine Aufgabe: kurze, konkrete Rückmeldung, dann die nächste Frage stellen. "
            "Keine langen Erklärungen. Erfinde keine Fakten.\n"
            "Format:\n"
            "Feedback: 2-4 Sätze (Klarheit, Verantwortung, Spezifität, ggf. Widerspruch).\n"
            "Nächste Frage: <genau eine Frage>\n"
        )
        user = (
            f"Modus: {mode}\n"
            f"Letzte Antwort des Nutzers:\n{user_answer}\n\n"
            f"Bitte stelle als nächste Frage exakt diese:\n{question}\n"
        )
    else:
        system = (
            "You are a strict MPU interview trainer. "
            "Your job: give short, concrete feedback, then ask the next question. "
            "No long explanations, no fluff. Do not invent facts.\n"
            "Format:\n"
            "Feedback: 2-4 sentences (clarity, responsibility, specificity, contradictions if any).\n"
            "Next question: <exactly one question>\n"
        )
        user = (
            f"Mode: {mode}\n"
            f"User's last answer:\n{user_answer}\n\n"
            f"Ask exactly this as the next question:\n{question}\n"
        )

    model = getattr(settings, "openai_model", None) or DEFAULT_MODEL

    # 1) Try Responses API
    try:
        from openai import OpenAI  # type: ignore

        client = OpenAI(api_key=settings.openai_api_key)

        resp = client.responses.create(
            model=model,
            instructions=system,
            input=user,
        )

        text = getattr(resp, "output_text", None)
        if text and str(text).strip():
            return str(text).strip()

        # fallback: try to extract from structured output
        try:
            out: list[str] = []
            for item in getattr(resp, "output", []) or []:
                if getattr(item, "type", None) == "message":
                    for c in getattr(item, "content", []) or []:
                        if getattr(c, "type", None) in ("output_text", "text"):
                            out.append(getattr(c, "text", "") or "")
            joined = "\n".join([t for t in out if t]).strip()
            if joined:
                return joined
        except Exception:
            pass

        return _fallback(mode=mode, question=question, locale=locale)

    except Exception:
        pass

    # 2) Fallback to Chat Completions
    try:
        from openai import OpenAI  # type: ignore

        client = OpenAI(api_key=settings.openai_api_key)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        content = resp.choices[0].message.content
        if content and content.strip():
            return content.strip()
    except Exception:
        pass

    return _fallback(mode=mode, question=question, locale=locale)


def _therapy_fallback(locale: str, focus: list[str]) -> str:
    focus_text = focus[0] if focus else "stabilization"
    loc = (locale or "ru").strip().lower()
    if loc.startswith("de"):
        return (
            "Ich bin bei Ihnen. Für den heutigen Schritt konzentrieren wir uns auf innere Stabilität. "
            f"Fokus: {focus_text}. "
            "Beschreiben Sie bitte: 1) was passiert ist, 2) was Sie dabei gedacht haben, "
            "3) welche kleine sichere Handlung Sie heute machen."
        )
    if loc.startswith("ru"):
        return (
            "Ок. Сейчас фокус на стабилизации. "
            f"Фокус: {focus_text}. "
            "Напиши: 1) что случилось (факты), 2) какие мысли были, 3) что конкретно сделаешь сегодня (1 шаг)."
        )
    return (
        "Ok. Let's stabilize first. "
        f"Focus: {focus_text}. "
        "Write: 1) what happened (facts), 2) what you thought, 3) one small safe action you'll do today."
    )


def generate_therapy_reply(
    *,
    user_message: str,
    history: list[dict[str, Any]],
    diagnostic_context: dict[str, Any],
    locale: str = "de",
) -> str:
    """
    Therapy-style reply for the 'therapist' chat (if you use it).
    If OPENAI_API_KEY missing or call fails -> deterministic fallback.
    """
    if not _has_openai():
        return _therapy_fallback(locale=locale, focus=list(diagnostic_context.get("focus", [])) if diagnostic_context else [])

    loc = (locale or "de").strip().lower()
    if loc.startswith("ru"):
        system = (
            "Ты опытный психолог, работающий с клиентами MPU. "
            "Главная цель: снизить тревогу, закрепить ответственность, подготовить клиента к интервью MPU. "
            "Используй контекст диагностики и отвечай на русском. "
            "Формат ответа строго такой: "
            "1) Короткая поддержка (1-2 предложения). "
            "2) Практический разбор ситуации клиента (2-4 предложения, по делу). "
            "3) Блок 'Что сказать на собеседовании MPU' — 2-3 готовые формулировки. "
            "4) Блок 'Задание до следующего шага' — нумерованный список из 2-4 действий. "
            "5) Один короткий вопрос для продолжения. "
            "Не давай юридических гарантий и не выдумывай факты."
        )
    elif loc.startswith("de"):
        system = (
            "Du bist ein erfahrener KI-Psychologe für MPU-Klienten. "
            "Führe eine volle therapeutische Sitzung mit Empathie und klarer Struktur. "
            "Ziel: Anspannung reduzieren, Verantwortung stärken, realistischen Veränderungsplan aufbauen. "
            "Nutze Diagnostik-Kontext. Antworte auf Deutsch. "
            "Format: Validierung, kurze Analyse, konkrete 2-4 Schritte, eine präzise Folgefrage."
        )
    else:
        system = (
            "You are an experienced AI psychologist for MPU clients. "
            "Run a full therapy-style session with professional structure. "
            "Goal: reduce distress, increase responsibility, build realistic behavior change plan. "
            "Use diagnostic context. "
            "Format: validation, concise analysis, concrete 2-4 step exercise, one precise follow-up question."
        )

    snippets: list[str] = []
    for msg in history[-8:]:
        role = "Клиент" if msg.get("role") == "user" else "Эксперт"
        snippets.append(f"{role}: {msg.get('content', '').strip()}")

    user_input = (
        f"Контекст диагностики: {diagnostic_context}\n\n"
        f"Недавняя история диалога:\n" + "\n".join(snippets) + "\n\n"
        f"Текущее сообщение клиента:\n{(user_message or '').strip()}"
    )

    model = getattr(settings, "openai_model", None) or DEFAULT_MODEL

    try:
        from openai import OpenAI  # type: ignore

        client = OpenAI(api_key=settings.openai_api_key)

        try:
            resp = client.responses.create(
                model=model,
                instructions=system,
                input=user_input,
            )
            text = getattr(resp, "output_text", None)
            if text and str(text).strip():
                return str(text).strip()
        except Exception:
            pass

        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_input},
                ],
            )
            content = resp.choices[0].message.content
            if content and content.strip():
                return content.strip()
        except Exception:
            pass

    except Exception:
        pass

    return _therapy_fallback(locale=locale, focus=list(diagnostic_context.get("focus", [])) if diagnostic_context else [])