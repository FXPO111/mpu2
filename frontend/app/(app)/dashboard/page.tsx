"use client";

import { useEffect, useMemo, useState } from "react";

type View = "overview" | "route" | "exam" | "dossier" | "evidence";
type StepType = "select" | "date" | "text" | "textarea" | "multiselect";

type BootstrapResp = {
  data: {
    state: "setup" | "session";
    next?: { step_id: string; label: string; type: StepType; options?: string[]; done?: boolean };
  };
};

type DayTask = {
  task_id: string;
  title: string;
  question: string;
  done: boolean;
  answer?: string;
  evaluation?: { overall?: string; strengths?: string[]; weaknesses?: string[] };
};

type DayResp = {
  data: {
    day: { status: string; done: number; total: number; day_index: number };
    tasks: DayTask[];
  };
};

const TABS: Array<{ key: View; label: string }> = [
  { key: "overview", label: "Обзор" },
  { key: "route", label: "Маршрут" },
  { key: "exam", label: "Экзамен" },
  { key: "dossier", label: "Досье" },
  { key: "evidence", label: "Доказательства" },
];

export default function DashboardPage() {
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [setupStep, setSetupStep] = useState<BootstrapResp["data"]["next"] | null>(null);
  const [setupValue, setSetupValue] = useState<string | string[]>("");
  const [day, setDay] = useState<DayResp["data"] | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/client/me", { cache: "no-store" });
      const meJson = await meRes.json().catch(() => null);
      if (!meRes.ok || !meJson?.data?.id) {
        window.location.href = "/pricing";
        return;
      }

      const statusRes = await fetch("/api/client/payments/status", { cache: "no-store" }).catch(() => null);
      const statusJson = await statusRes?.json().catch(() => null);
      if (!statusRes?.ok || !statusJson?.data?.program_active) {
        window.location.href = "/pricing";
        return;
      }

      await loadRoute();
      setLoading(false);
    })();
  }, []);

  async function loadRoute() {
    setError(null);
    const bootRes = await fetch("/api/client/route/bootstrap", { cache: "no-store" });
    const boot = (await bootRes.json().catch(() => null)) as BootstrapResp | null;
    if (!bootRes.ok) {
      setError((boot as any)?.error?.message ?? "Не удалось загрузить маршрут");
      return;
    }

    if (boot?.data?.state === "setup") {
      setSetupStep(boot.data.next ?? null);
      setSetupValue(boot.data.next?.type === "multiselect" ? [] : "");
      setDay(null);
      setView("route");
      return;
    }

    setSetupStep(null);
    await loadDay();
  }

  async function loadDay() {
    const dayRes = await fetch("/api/client/route/day/today", { cache: "no-store" });
    const dayJson = (await dayRes.json().catch(() => null)) as DayResp | null;
    if (!dayRes.ok || !dayJson?.data) {
      setError((dayJson as any)?.error?.message ?? "Не удалось загрузить задачи дня");
      return;
    }

    setDay(dayJson.data);
    setTaskId(dayJson.data.tasks[0]?.task_id ?? null);
  }

  function setupValueIsEmpty(): boolean {
    if (Array.isArray(setupValue)) return setupValue.length === 0;
    return !setupValue.trim();
  }

  async function submitSetup() {
    if (!setupStep || setupValueIsEmpty()) {
      setError("Заполните поле перед сохранением");
      return;
    }

    setSaving(true);
    setError(null);

    const res = await fetch("/api/client/route/setup/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step_id: setupStep.step_id, value: setupValue }),
    });

    const json = await res.json().catch(() => null);
    setSaving(false);

    if (!res.ok) {
      setError(json?.error?.message ?? "Не удалось сохранить настройку");
      return;
    }

    if (json?.data?.done) {
      await loadRoute();
      return;
    }

    setSetupStep(json?.data ?? null);
    setSetupValue(json?.data?.type === "multiselect" ? [] : "");
  }

  async function submitTask() {
    if (!taskId || !answer.trim()) {
      setError("Введите ответ перед сохранением");
      return;
    }

    setSaving(true);
    setError(null);

    const res = await fetch("/api/client/route/day/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId, answer: answer.trim() }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);

    if (!res.ok) {
      setError(json?.error?.message ?? "Не удалось сохранить ответ");
      return;
    }

    setAnswer("");
    await loadDay();
  }

  const activeTask = useMemo(() => day?.tasks.find((x) => x.task_id === taskId) ?? day?.tasks[0] ?? null, [day, taskId]);

  const routeProgress = useMemo(() => {
    if (setupStep) return 5;
    if (!day) return 0;
    return Math.round((day.day.done / Math.max(1, day.day.total)) * 100);
  }, [setupStep, day]);

  const overviewCards = useMemo(
    () => [
      { title: "Маршрут", value: `${routeProgress}%`, text: setupStep ? "Нужно завершить настройку" : "Прогресс по задачам дня" },
      { title: "Экзамен", value: day?.tasks.filter((t) => !!t.evaluation).length ?? 0, text: "Оценённые ответы" },
      { title: "Досье", value: setupStep ? "в процессе" : "готово", text: "Заполняется через маршрут" },
      { title: "Доказательства", value: day?.day.status === "complete" ? "день завершён" : "день открыт", text: "Статус текущего дня" },
    ],
    [routeProgress, setupStep, day],
  );

  function renderSetupInput() {
    if (!setupStep) return null;

    if (setupStep.type === "select") {
      return (
        <select
          className="cabinet-v2-input"
          value={Array.isArray(setupValue) ? "" : setupValue}
          onChange={(e) => setSetupValue(e.target.value)}
        >
          <option value="">Выберите вариант</option>
          {(setupStep.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (setupStep.type === "multiselect") {
      const values = Array.isArray(setupValue) ? setupValue : [];
      return (
        <div className="cabinet-v2-input-wrap">
          {(setupStep.options ?? []).map((option) => {
            const checked = values.includes(option);
            return (
              <label key={option} className="small" style={{ display: "flex", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) setSetupValue([...values, option]);
                    else setSetupValue(values.filter((x) => x !== option));
                  }}
                />
                {option}
              </label>
            );
          })}
        </div>
      );
    }

    if (setupStep.type === "date") {
      return (
        <input
          className="cabinet-v2-input"
          type="date"
          value={Array.isArray(setupValue) ? "" : setupValue}
          onChange={(e) => setSetupValue(e.target.value)}
        />
      );
    }

    if (setupStep.type === "textarea") {
      return (
        <textarea
          className="cabinet-v2-input"
          rows={4}
          value={Array.isArray(setupValue) ? "" : setupValue}
          onChange={(e) => setSetupValue(e.target.value)}
        />
      );
    }

    return (
      <input
        className="cabinet-v2-input"
        type="text"
        value={Array.isArray(setupValue) ? "" : setupValue}
        onChange={(e) => setSetupValue(e.target.value)}
      />
    );
  }

  if (loading) {
    return (
      <main className="cabinet-v2-main">
        <section className="cabinet-v2-hero">
          <h1 className="cabinet-v2-title">Загрузка кабинета…</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="cabinet-v2-main">
      <section className="cabinet-v2-hero">
        <div>
          <h1 className="cabinet-v2-title">Рабочий кабинет подготовки к MPU</h1>
          <p className="cabinet-v2-subtitle">Пошаговая подготовка: маршрут, экзамен, досье и подтверждения.</p>
        </div>
        <div className="cabinet-v2-chips">
          <span className="chip">Прогресс: {routeProgress}%</span>
          <span className="chip">День: {day?.day.day_index ?? 1}</span>
          <span className="chip">Задачи: {day ? `${day.day.done}/${day.day.total}` : "0/0"}</span>
        </div>
      </section>

      <nav className="cabinet-v2-nav">
        {TABS.map((tab) => (
          <button key={tab.key} className={`navlink ${view === tab.key ? "active" : ""}`} onClick={() => setView(tab.key)}>
            {tab.label}
          </button>
        ))}
      </nav>

      {error ? <section className="cabinet-v2-block"><p className="p">{error}</p></section> : null}

      {view === "overview" ? (
        <section className="cabinet-v2-columns">
          <div className="cabinet-v2-status">
            <div className="cabinet-v2-status-top">
              <h2 className="h3">Общий прогресс</h2>
              <span className="cabinet-v2-score">{routeProgress}/100</span>
            </div>
            <div className="cabinet-v2-progress">
              <div style={{ width: `${routeProgress}%` }} />
            </div>
            <p className="p">Оценка обновляется по факту выполнения setup и задач текущего дня.</p>
          </div>

          <div className="cabinet-v2-block">
            <h2 className="h3">Секции кабинета</h2>
            <div className="cabinet-v2-task-list">
              {overviewCards.map((card) => (
                <div key={card.title} className="cabinet-v2-task-item">
                  <strong>{card.title}</strong>
                  <span>{String(card.value)}</span>
                  <p className="small">{card.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {view === "route" && setupStep ? (
        <section className="cabinet-v2-block">
          <h2 className="h3">Настройка маршрута</h2>
          <p className="p">{setupStep.label}</p>
          <div className="cabinet-v2-input-wrap">{renderSetupInput()}</div>
          <div className="cabinet-v2-actions">
            <button className="btn" disabled={saving} onClick={() => void submitSetup()}>
              {saving ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        </section>
      ) : null}

      {view === "route" && !setupStep && day ? (
        <section className="cabinet-v2-columns">
          <article className="cabinet-v2-block">
            <h2 className="h3">Задача дня</h2>
            {activeTask ? (
              <>
                <p className="small">{activeTask.title}</p>
                <p className="p">{activeTask.question}</p>
                <textarea className="cabinet-v2-input" rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} />
                <div className="cabinet-v2-actions">
                  <button className="btn" disabled={saving} onClick={() => void submitTask()}>
                    {saving ? "Сохраняем…" : "Сохранить"}
                  </button>
                  {day.day.status === "complete" ? (
                    <button className="btn secondary" onClick={() => void loadRoute()}>
                      Обновить
                    </button>
                  ) : null}
                </div>
                {activeTask.evaluation ? (
                  <div className="cabinet-v2-block" style={{ marginTop: 10 }}>
                    <p className="p"><strong>Оценка:</strong> {activeTask.evaluation.overall ?? "—"}</p>
                    {activeTask.evaluation.strengths?.length ? (
                      <p className="small">Сильные стороны: {activeTask.evaluation.strengths.join(", ")}</p>
                    ) : null}
                    {activeTask.evaluation.weaknesses?.length ? (
                      <p className="small">Слабые места: {activeTask.evaluation.weaknesses.join(", ")}</p>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="p">На сегодня нет задач.</p>
            )}
          </article>

          <aside className="cabinet-v2-block">
            <h2 className="h3">Шаги дня</h2>
            <div className="cabinet-v2-task-list">
              {day.tasks.map((t, index) => (
                <button
                  key={t.task_id}
                  className="cabinet-v2-task-item"
                  onClick={() => setTaskId(t.task_id)}
                  style={{ borderColor: taskId === t.task_id ? "#8dc6a6" : undefined }}
                >
                  <strong>{index + 1}. {t.title}</strong>
                  <span>{t.done ? "Готово" : "Открыто"}</span>
                </button>
              ))}
            </div>
            {day.day.status === "complete" ? <p className="small">День завершён. Можно обновить и перейти к следующему.</p> : null}
          </aside>
        </section>
      ) : null}

      {view !== "overview" && view !== "route" ? (
        <section className="cabinet-v2-block">
          <h2 className="h3">{TABS.find((x) => x.key === view)?.label}</h2>
          <p className="p">Раздел доступен в MVP, данные постепенно будут наполняться из маршрута.</p>
        </section>
      ) : null}
    </main>
  );
}
