"use client";

import { useEffect, useMemo, useState } from "react";

type View = "route" | "exam" | "dossier" | "evidence";

type BootstrapResp = { data: { state: "setup" | "session"; next?: { step_id: string; label: string; type: string; options?: string[]; done?: boolean } } };

type DayResp = { data: { day: { status: string; done: number; total: number; day_index: number }; tasks: Array<{ task_id: string; title: string; question: string; done: boolean; answer?: string; evaluation?: any }> } };

export default function DashboardPage() {
  const [view, setView] = useState<View>("route");
  const [loading, setLoading] = useState(true);
  const [setupStep, setSetupStep] = useState<any>(null);
  const [setupValue, setSetupValue] = useState("");
  const [day, setDay] = useState<DayResp["data"] | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/client/me", { cache: "no-store" });
      const meJson = await meRes.json().catch(() => null);
      if (!meRes.ok || !meJson?.data?.id) return (window.location.href = "/pricing");

      const statusRes = await fetch("/api/client/payments/status", { cache: "no-store" }).catch(() => null);
      const statusJson = await statusRes?.json().catch(() => null);
      if (!statusRes?.ok || !statusJson?.data?.program_active) return (window.location.href = "/pricing");

      await loadRoute();
      setLoading(false);
    })();
  }, []);

  async function loadRoute() {
    setError(null);
    const bootRes = await fetch("/api/client/route/bootstrap", { cache: "no-store" });
    const boot = (await bootRes.json()) as BootstrapResp;
    if (!bootRes.ok) return setError(boot?.error?.message ?? "bootstrap error");
    if (boot.data.state === "setup") {
      setSetupStep(boot.data.next ?? null);
      return;
    }
    setSetupStep(null);
    const dayRes = await fetch("/api/client/route/day/today", { cache: "no-store" });
    const dayJson = (await dayRes.json()) as DayResp;
    if (!dayRes.ok) return setError(dayJson?.error?.message ?? "day error");
    setDay(dayJson.data);
    setTaskId(dayJson.data.tasks[0]?.task_id ?? null);
  }

  async function submitSetup() {
    if (!setupStep) return;
    const res = await fetch("/api/client/route/setup/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step_id: setupStep.step_id, value: setupValue }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json?.error?.message ?? "setup error");
    if (json?.data?.done) return loadRoute();
    setSetupStep(json.data);
    setSetupValue("");
  }

  async function submitTask() {
    if (!taskId || !answer.trim()) return;
    const res = await fetch("/api/client/route/day/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId, content: answer.trim() }),
    });
    if (!res.ok) return;
    setAnswer("");
    await loadRoute();
  }

  const activeTask = useMemo(() => day?.tasks.find((x) => x.task_id === taskId) ?? day?.tasks[0] ?? null, [day, taskId]);
  const routeProgress = useMemo(() => {
    if (setupStep) return 5;
    if (!day) return 0;
    return Math.round((day.day.done / Math.max(1, day.day.total)) * 100);
  }, [setupStep, day]);

  if (loading) return <main><p>Загрузка...</p></main>;

  return (
    <main>
      <h1>Кабинет</h1>
      <p>Прогресс маршрута: {routeProgress}%</p>
      <nav style={{ display: "flex", gap: 8 }}>
        {(["route", "exam", "dossier", "evidence"] as View[]).map((tab) => <button key={tab} onClick={() => setView(tab)}>{tab}</button>)}
      </nav>
      {error ? <p>{error}</p> : null}
      {view !== "route" ? <p>Раздел в MVP.</p> : null}

      {view === "route" && setupStep ? (
        <section>
          <h3>Настройка маршрута</h3>
          <p>{setupStep.label}</p>
          <textarea value={setupValue} onChange={(e) => setSetupValue(e.target.value)} />
          <button onClick={submitSetup}>Сохранить</button>
        </section>
      ) : null}

      {view === "route" && !setupStep && day ? (
        <section style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12 }}>
          <aside>
            {day.tasks.map((t) => (
              <button key={t.task_id} onClick={() => setTaskId(t.task_id)} style={{ display: "block", marginBottom: 6 }}>
                {t.done ? "✅" : "⬜"} {t.title}
              </button>
            ))}
            {day.day.status === "complete" ? <button onClick={loadRoute}>Обновить</button> : null}
          </aside>
          <article>
            {activeTask ? (
              <>
                <p>{activeTask.question}</p>
                <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} />
                <button onClick={submitTask}>Сохранить</button>
                {activeTask.evaluation ? <pre>{JSON.stringify(activeTask.evaluation, null, 2)}</pre> : null}
              </>
            ) : null}
          </article>
        </section>
      ) : null}
    </main>
  );
}
