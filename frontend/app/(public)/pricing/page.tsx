"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toPublicApiUrl } from "@/lib/public-api-base";

type PlanKey = "start" | "pro" | "intensive";

type Plan = {
  key: PlanKey;
  title: string;
  price: string;
  period: string;
  items: string[];
};

const PLANS: Plan[] = [
  {
    key: "start",
    title: "Start",
    price: "€79",
    period: "14 дней",
    items: [
      "Диагностика и карта рисков",
      "План подготовки по неделям",
      "Базовые модули",
      "Тренировки интервью (лимит N)",
      "Чеклист документов",
    ],
  },
  {
    key: "pro",
    title: "Pro",
    price: "€169",
    period: "30 дней",
    items: [
      "Всё из Start",
      "Тренировки интервью без лимита",
      "Расширенная проверка формулировок",
      "Финальный контроль готовности + отчёт",
    ],
  },
  {
    key: "intensive",
    title: "Intensive",
    price: "€289",
    period: "45 дней",
    items: [
      "Всё из Pro",
      "Дополнительные итерации финальной проверки",
      "Приоритетная поддержка",
    ],
  },
];

function track(event: "view_pricing_section" | "select_plan_start" | "select_plan_pro" | "select_plan_intensive") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("analytics:event", { detail: { event } }));
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (gtag) gtag("event", event, {});
}

export default function PricingPage() {
  const params = useSearchParams();
  const [recommended, setRecommended] = useState<PlanKey>("pro");
  const [email, setEmail] = useState("");
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fromUrl = params.get("plan");
    const fromStorage = typeof window !== "undefined" ? localStorage.getItem("recommended_plan") : null;
    const value = (fromUrl || fromStorage) as PlanKey | null;
    if (value === "start" || value === "pro" || value === "intensive") {
      setRecommended(value);
    }
  }, [params]);

  useEffect(() => {
    if (!rootRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            track("view_pricing_section");
            obs.disconnect();
          }
        });
      },
      { threshold: 0.35 },
    );
    obs.observe(rootRef.current);
    return () => obs.disconnect();
  }, []);

  const eventByPlan = useMemo(
    () =>
      ({
        start: "select_plan_start",
        pro: "select_plan_pro",
        intensive: "select_plan_intensive",
      }) as const,
    [],
  );

  const startCheckout = async (plan: PlanKey) => {
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Укажите email — туда придет подтверждение оплаты.");
      return;
    }

    setLoadingPlan(plan);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("checkout_email", normalizedEmail);
      }
      const apiUrl = toPublicApiUrl("/api/public/checkout");
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          email: normalizedEmail,
          success_url: origin ? `${origin}/dashboard?checkout=success` : undefined,
          cancel_url: origin ? `${origin}/pricing?checkout=cancelled` : undefined,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        let errorCode: string | undefined;
        try {
          const parsed = JSON.parse(errText) as { error?: { code?: string } };
          errorCode = parsed.error?.code;
        } catch {
          // ignore non-json backend errors
        }

        if (errorCode === "PRODUCT_NOT_FOUND") {
          throw new Error("PRODUCT_NOT_FOUND");
        }
        if (errorCode === "STRIPE_NOT_CONFIGURED") {
          throw new Error("STRIPE_NOT_CONFIGURED");
        }
        if (errorCode === "CHECKOUT_FAILED") {
          throw new Error("CHECKOUT_FAILED");
        }

        throw new Error(errText || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        checkout_url?: string;
      };

      track(eventByPlan[plan]);
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setError("Не получили ссылку на оплату. Попробуйте еще раз.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      if (errorMessage === "PRODUCT_NOT_FOUND") {
        setError("Тариф не настроен на сервере (нет продукта).");
      } else if (errorMessage === "STRIPE_NOT_CONFIGURED") {
        setError("Оплата временно недоступна (Stripe не настроен).");
      } else if (errorMessage === "CHECKOUT_FAILED") {
        setError("Не удалось запустить оплату. Проверьте Stripe-настройки.");
      } else {
        setError("Не удалось запустить оплату. Проверьте сервер и Stripe-настройки.");
      }
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="public-page-stack pricing-clean" id="pricing" ref={rootRef}>
      <section className="card pad pricing-clean-hero">
        <h1 className="h1">Выберите формат подготовки</h1>
        <p className="lead mt-12">Начните с диагностики — рекомендованный вариант уже отмечен на основе результата.</p>
        <div className="field mt-16 pricing-email-field">
          <label className="label" htmlFor="pricing-email">
            Email для оплаты
          </label>
          <Input
            id="pricing-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </section>

      <section className="plan-grid clean-grid pricing-grid-equal">
        {PLANS.map((plan) => {
          const isRecommended = plan.key === recommended;
          const isLoading = loadingPlan === plan.key;
          return (
            <article
              key={plan.key}
              className={`clean-plan card pad pricing-plan-card ${isRecommended ? "clean-plan-featured" : ""}`}
            >
              <h2 className="h3">{plan.title}</h2>
              <p className={`small mt-8 pricing-plan-note ${isRecommended ? "" : "is-empty"}`} aria-hidden={!isRecommended}>
                Рекомендуемый формат
              </p>

              <div className="plan-price-wrap">
                <div className="plan-price">{plan.price}</div>
                <div className="small">{plan.period}</div>
              </div>

              <ul className="plan-list mt-16">
                {plan.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <div className="hero-actions mt-16 pricing-plan-actions">
                <Button
                  className="w-full"
                  variant={isRecommended ? "primary" : "secondary"}
                  disabled={isLoading}
                  onClick={() => startCheckout(plan.key)}
                >
                  {isLoading ? "Переходим к оплате..." : `Выбрать ${plan.title} и оплатить`}
                </Button>
              </div>
            </article>
          );
        })}
      </section>

      {error ? <p className="help">{error}</p> : null}

      <p className="small">
        Результат зависит от исходных данных и выполнения программы. Подготовка снижает риск провала за счёт структуры,
        тренировок и контроля.
      </p>
    </div>
  );
}