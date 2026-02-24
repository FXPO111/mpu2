import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  return (
    <div>
      <h1 className="h2">Вход</h1>
      <p className="p">Доступ в кабинет и к истории кейсов.</p>

      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="badge">Email</span>
          <Input type="email" placeholder="you@example.com" />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span className="badge">Пароль</span>
          <Input type="password" placeholder="••••••••" />
        </label>

        <Button style={{ marginTop: 6 }}>Войти</Button>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <Link className="navlink" href="/pricing">Тарифы</Link>
          <Link className="navlink" href="/">На главную</Link>
        </div>
      </div>
    </div>
  );
}
