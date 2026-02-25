"use client";

import { useEffect, useState } from "react";

export default function AccountMenu() {
  const [me, setMe] = useState<{ email: string } | null>(null);

  useEffect(() => {
    fetch("/api/client/me", { cache: "no-store" }).then(async (res) => {
      if (!res.ok) return;
      const json = await res.json();
      setMe(json?.data ?? null);
    });
  }, []);

  const logout = async () => {
    await fetch("/api/client/logout", { method: "POST" });
    window.location.href = "/";
  };

  if (!me) return <a href="/pricing">Войти</a>;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span>{me.email}</span>
      <a href="/dashboard">Кабинет</a>
      <a href="/">Главная</a>
      <button onClick={logout}>Выйти</button>
    </div>
  );
}
