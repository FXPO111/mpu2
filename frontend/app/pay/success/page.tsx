"use client";
import { useEffect, useState } from "react";

export default function PaySuccessPage() {
  const [status, setStatus] = useState("Оплата обрабатывается…");

  useEffect(() => {
    let tries = 0;
    const id = setInterval(async () => {
      tries += 1;
      const res = await fetch("/api/client/payments/status", { cache: "no-store" });
      const json = await res.json();
      if (json?.data?.program_active) {
        window.location.href = "/dashboard";
        return;
      }
      if (tries >= 60) {
        clearInterval(id);
        setStatus("Статус еще не обновился.");
      }
    }, 1500);
    return () => clearInterval(id);
  }, []);

  return <main><h1>{status}</h1><a href="/dashboard">Перейти в кабинет</a></main>;
}
