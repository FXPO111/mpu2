"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type PlanKey = "start" | "pro" | "intensive";
type Product = { id: string; code: string; price_cents: number; currency: string; type: string };
type Me = { id: string; email: string } | null;

const BACKEND_CANDIDATES = [
  typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:8000` : "",
  "http://backend:8000",
  "http://host.docker.internal:8000",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
].filter(Boolean);

function planFromCode(code: string): PlanKey | null {
  if (code === "PLAN_START") return "start";
  if (code === "PLAN_PRO") return "pro";
  if (code === "PLAN_INTENSIVE") return "intensive";
  return null;
}

export default function PricingPage() {
  const params = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [me, setMe] = useState<Me>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authForm, setAuthForm] = useState({ email: "", password: "", name: "" });

  useEffect(() => {
    fetch("/api/client/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        setMe(json?.data ?? null);
      })
      .catch(() => undefined);

    const loadProducts = async () => {
      const fromProxy = await fetch("/api/public/products", { cache: "no-store" }).catch(() => null);
      if (fromProxy?.ok) {
        const contentType = fromProxy.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const json = await fromProxy.json();
          const rows = (json?.data ?? []) as Product[];
          setProducts(rows.filter((p) => p.type === "program" && ["PLAN_START", "PLAN_PRO", "PLAN_INTENSIVE"].includes(p.code)));
          return;
        }
      }

      for (const baseUrl of BACKEND_CANDIDATES) {
        const resp = await fetch(`${baseUrl}/api/public/products`, { cache: "no-store" }).catch(() => null);
        if (!resp?.ok) continue;
        const json = await resp.json().catch(() => null);
        const rows = (json?.data ?? []) as Product[];
        setProducts(rows.filter((p) => p.type === "program" && ["PLAN_START", "PLAN_PRO", "PLAN_INTENSIVE"].includes(p.code)));
        return;
      }

      setError("Не удалось загрузить тарифы. Проверь, что backend доступен на :8000.");
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

  async function runCheckout(productId: string) {
    setError(null);
    const res = await fetch("/api/client/payments/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json?.error?.message ?? "Checkout error");
    if (json?.data?.checkout_url) window.location.href = json.data.checkout_url;
  }

  async function onBuy(productId: string) {
    if (!me) {
      setPendingProductId(productId);
      setShowAuth(true);
      return;
    }
    await runCheckout(productId);
  }

  async function submitAuth() {
    const path = mode === "login" ? "/api/client/login" : "/api/client/register";
    const payload = mode === "login"
      ? { email: authForm.email, password: authForm.password }
      : { email: authForm.email, password: authForm.password, name: authForm.name || authForm.email.split("@")[0] };
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return setError(json?.error?.message ?? "Auth error");
    }
    const meRes = await fetch("/api/client/me", { cache: "no-store" });
    const meJson = await meRes.json();
    setMe(meJson?.data ?? null);
    setShowAuth(false);
    if (pendingProductId) await runCheckout(pendingProductId);
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center" }}>
          <div style={{ background: "#fff", padding: 16, width: 360 }}>
            <h3>{mode === "login" ? "Войти" : "Регистрация"}</h3>
            <input placeholder="Email" value={authForm.email} onChange={(e) => setAuthForm((s) => ({ ...s, email: e.target.value }))} />
            <input placeholder="Password" type="password" value={authForm.password} onChange={(e) => setAuthForm((s) => ({ ...s, password: e.target.value }))} />
            {mode === "register" ? <input placeholder="Name" value={authForm.name} onChange={(e) => setAuthForm((s) => ({ ...s, name: e.target.value }))} /> : null}
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button onClick={submitAuth}>Продолжить</button>
              <button onClick={() => setMode((m) => (m === "login" ? "register" : "login"))}>{mode === "login" ? "Нет аккаунта" : "Уже есть аккаунт"}</button>
              <button onClick={() => setShowAuth(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
