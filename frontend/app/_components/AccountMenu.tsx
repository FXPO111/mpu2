"use client";

import { useEffect, useState } from "react";

export default function AccountMenu({ compact = false, publicMode = false }: { compact?: boolean; publicMode?: boolean }) {
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

  if (!me) {
    if (publicMode) {
      return <a className="public-account-login" href="/login">Войти</a>;
    }
    return <a className="cabinet-v2-menu-link" href="/login">Войти</a>;
  }

  if (compact) {
    return (
      <div className="cabinet-v2-menu">
        <span className="cabinet-v2-email">{me.email}</span>
        <a className="cabinet-v2-menu-link" href="/">Главная</a>
        <button className="cabinet-v2-menu-link" onClick={logout}>Выйти</button>
      </div>
    );
  }

  if (publicMode) {
    return (
      <div className="public-account-menu">
        <span className="public-account-email">{me.email}</span>
        <a className="public-account-link" href="/dashboard">Кабинет</a>
        <a className="public-account-link" href="/">Главная</a>
        <button className="public-account-link" onClick={logout}>Выйти</button>
      </div>
    );
  }

  return (
    <div className="cabinet-v2-menu">
      <span className="cabinet-v2-email">{me.email}</span>
      <a className="cabinet-v2-menu-link" href="/dashboard">Кабинет</a>
      <a className="cabinet-v2-menu-link" href="/">Главная</a>
      <button className="cabinet-v2-menu-link" onClick={logout}>Выйти</button>
    </div>
  );
}
