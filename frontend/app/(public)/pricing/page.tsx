"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type PlanKey = "start" | "pro" | "intensive";
type Product = { id: string; code: string; price_cents: number; currency: string; type: string };

const FALLBACK_PLANS: Product[] = [
  { id: "fallback-start", code: "PLAN_START", price_cents: 23000, currency: "EUR", type: "program" },
  { id: "fallback-pro", code: "PLAN_PRO", price_cents: 70000, currency: "EUR", type: "program" },
  { id: "fallback-intensive", code: "PLAN_INTENSIVE", price_cents: 150000, currency: "EUR", type: "program" },
];

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function loadProductsFromAnySource(): Promise<Product[] | null> {
  const proxyResp = await fetch("/api/client/products", { cache: "no-store" }).catch(() => null);
  if (proxyResp?.ok) {
    const json = await proxyResp.json().catch(() => null);
    const rows = (json?.data ?? []) as Product[];
    const plans = rows.filter((p) => p.type === "program" && ["PLAN_START", "PLAN_PRO", "PLAN_INTENSIVE"].includes(p.code));
    if (plans.length) return plans;
  }

  return null;
}

function planFromCode(code: string): PlanKey | null {
  if (code === "PLAN_START") return "start";
  if (code === "PLAN_PRO") return "pro";
  if (code === "PLAN_INTENSIVE") return "intensive";
  return null;
}

export default function PricingPage() {
  const params = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [showAuth, setShowAuth] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authForm, setAuthForm] = useState({ email: "", password: "", name: "" });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const loadProducts = async () => {
      const plans = await loadProductsFromAnySource();
      if (plans?.length) {
        setProducts(plans);
        return;
      }

      setProducts(FALLBACK_PLANS);
      setError("Не удалось обновить тарифы с сервера, показаны базовые цены.");
    };

    void loadProducts();
  }, []);

  useEffect(() => {
    const plan = params.get("plan");
    if (plan) localStorage.setItem("recommended_plan", plan);
  }, [params]);

  const sorted = useMemo(() => {
    const order = { PLAN_START: 0, PLAN_PRO: 1, PLAN_INTENSIVE: 2 } as Record<string, number>;
    return [...products].sort((a, b) => (order[a.code] ?? 99) - (order[b.code] ?? 99));
  }, [products]);

  async function runCheckout(productId: string): Promise<boolean> {
    setError(null);
    const res = await fetch("/api/client/payments/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId }),
    });
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      if (res.status === 401) {
        setShowAuth(true);
        setAuthError("Сессия истекла, войдите снова.");
      } else {
        setError(json?.error?.message ?? "Checkout error");
      }
      return false;
    }
    if (json?.data?.checkout_url) {
      window.location.href = json.data.checkout_url;
      return true;
    }
    setError("Сервер не вернул ссылку на оплату");
    return false;
  }

  async function tryCheckoutWithRetry(productId: string, attempts = 3): Promise<boolean> {
    for (let i = 0; i < attempts; i += 1) {
      const started = await runCheckout(productId);
      if (started) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  }

  async function resolveCheckoutProductId(productId: string): Promise<string | null> {
    if (isValidUuid(productId)) return productId;

    const current = products.find((p) => p.id === productId);
    const refreshed = await loadProductsFromAnySource();
    if (refreshed?.length) {
      setProducts(refreshed);
      const byCode = refreshed.find((p) => p.code === current?.code);
      if (byCode?.id && isValidUuid(byCode.id)) return byCode.id;
    }

    return null;
  }

  async function onBuy(productId: string) {
    const checkoutProductId = await resolveCheckoutProductId(productId);
    if (!checkoutProductId) {
      setError("Не удалось получить ID тарифа с сервера. Проверьте backend и обновите страницу.");
      return;
    }

    const started = await runCheckout(checkoutProductId);
    if (started) return;

    setPendingProductId(productId);
    setAuthError(null);
    setShowAuth(true);
  }

  async function submitAuth() {
    if (authLoading) return;
    const email = authForm.email.trim();
    const password = authForm.password.trim();
    const name = authForm.name.trim();

    if (!email || !password) {
      setAuthError("Введите email и пароль");
      return;
    }
    if (password.length < 10) {
      setAuthError("Пароль должен быть минимум 10 символов");
      return;
    }
    if (mode === "register" && !name) {
      setAuthError("Введите имя для регистрации");
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    try {
      const path = mode === "login" ? "/api/client/login" : "/api/client/register";
      const payload = mode === "login"
        ? { email, password }
        : { email, password, name: name || email.split("@")[0] };
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

      if (!res.ok) {
        const json = await res.json().catch(() => ({} as any));
        const detail = Array.isArray(json?.detail) ? json.detail[0]?.msg : null;
        if (mode === "register" && res.status === 409) {
          setMode("login");
          setAuthError("Этот email уже зарегистрирован. Войдите с паролем.");
          return;
        }
        setAuthError(json?.error?.message ?? detail ?? "Auth error");
        return;
      }

      if (pendingProductId) {
        const checkoutProductId = await resolveCheckoutProductId(pendingProductId);
        if (!checkoutProductId) {
          setError("Не удалось получить ID тарифа с сервера. Проверьте backend и обновите страницу.");
          return;
        }

        const started = await tryCheckoutWithRetry(checkoutProductId, 3);
        if (!started) {
          setAuthError("Не удалось перейти к оплате. Проверьте данные и попробуйте снова.");
          return;
        }
      }

      setShowAuth(false);
    } catch {
      setAuthError("Сетевая ошибка. Попробуйте ещё раз.");
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <main>
      <h1>Тарифы</h1>
      {error ? <p>{error}</p> : null}
      <div style={{ display: "grid", gap: 12 }}>
        {sorted.map((p) => (
          <div key={p.id} style={{ border: "1px solid #ddd", padding: 12 }}>
            <h3>{planFromCode(p.code)?.toUpperCase() ?? p.code}</h3>
            <p>{(p.price_cents / 100).toFixed(0)} {p.currency}</p>
            <button onClick={() => onBuy(p.id)}>Выбрать и оплатить</button>
          </div>
        ))}
      </div>

      {showAuth ? (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 9999 }}
          onClick={() => {
            if (authLoading) return;
            setShowAuth(false);
          }}
        >
          <div
            style={{ background: "#fff", padding: 16, width: 360, borderRadius: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{mode === "login" ? "Войти" : "Регистрация"}</h3>
            {authError ? <p style={{ color: "#b42318" }}>{authError}</p> : null}
            <input
              placeholder="Email"
              value={authForm.email}
              onChange={(e) => setAuthForm((s) => ({ ...s, email: e.target.value }))}
              style={{ width: "100%", marginBottom: 8 }}
            />
            <input
              placeholder="Password"
              type="password"
              value={authForm.password}
              onChange={(e) => setAuthForm((s) => ({ ...s, password: e.target.value }))}
              style={{ width: "100%", marginBottom: 8 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitAuth();
              }}
            />
            {mode === "register" ? (
              <input
                placeholder="Name"
                value={authForm.name}
                onChange={(e) => setAuthForm((s) => ({ ...s, name: e.target.value }))}
                style={{ width: "100%", marginBottom: 8 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitAuth();
                }}
              />
            ) : null}
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button onClick={() => void submitAuth()} disabled={authLoading}>{authLoading ? "Проверка..." : "Продолжить"}</button>
              <button
                onClick={() => {
                  if (authLoading) return;
                  setMode((m) => (m === "login" ? "register" : "login"));
                  setAuthError(null);
                }}
                disabled={authLoading}
              >
                {mode === "login" ? "Нет аккаунта" : "Уже есть аккаунт"}
              </button>
              <button onClick={() => setShowAuth(false)} disabled={authLoading}>Закрыть</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}