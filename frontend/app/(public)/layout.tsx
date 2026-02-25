import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import AccountMenu from "@/app/_components/AccountMenu";

const MENU = [
  { href: "/#program", label: "Программа" },
  { href: "/pricing", label: "Тарифы" },
  { href: "/diagnostic", label: "Диагностика" },
  { href: "/#contacts", label: "Контакты" },
];

const PRODUCT_LINKS = [
  { href: "/#pricing", label: "Пакеты" },
  { href: "/#program", label: "Программа" },
  { href: "/diagnostic", label: "Диагностика" },
];

const LEGAL_LINKS = [
  { href: "/impressum", label: "Impressum" },
  { href: "/privacy", label: "Datenschutz" },
];

export const metadata: Metadata = {
  title: "Подготовка к MPU — план, тренировки интервью, контроль готовности",
  description:
    "Онлайн-подготовка к MPU по протоколу: диагностика, план по неделям, тренировки интервью и финальная проверка.",
  openGraph: {
    title: "Подготовка к MPU — план, тренировки интервью, контроль готовности",
    description:
      "Онлайн-подготовка к MPU по протоколу: диагностика, план по неделям, тренировки интервью и финальная проверка.",
  },
};

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="public-header compact-header">
        <div className="topstrip">
          <div className="container topstrip-inner">
            <span>MPU Praxis DP • структурированная онлайн-подготовка к MPU</span>
            <a href="mailto:info@mpu-praxis-dp.de">info@mpu-praxis-dp.de</a>
          </div>
        </div>

        <div className="container public-header-inner">
          <Link href="/" className="brand">
            <span className="brand-dot" />
            MPU Praxis DP
          </Link>

          <nav className="nav">
            {MENU.map((item) => (
              <Link key={item.href} href={item.href} className="navlink">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="public-header-controls">
            <div className="header-actions">
              <Link href="/diagnostic">
                <Button size="sm">Начать диагностику</Button>
              </Link>
              <Link href="/#pricing">
                <Button variant="secondary" size="sm">
                  Тарифы
                </Button>
              </Link>
            </div>

            <div className="public-account-wrap">
              <AccountMenu publicMode />
            </div>
          </div>
        </div>
      </header>

      <main className="container page public-design-refactor">{children}</main>

      <footer className="container footer" id="contacts">
        <div className="footer-grid">
          <div>
            <div className="badge">Контакты</div>
            <div className="p mt-10">
              <a href="tel:+491752730963">+49 175 27 30 963</a>
              <br />
              <a href="mailto:info@mpu-praxis-dp.de">info@mpu-praxis-dp.de</a>
            </div>
            <div className="p mt-10">Viktoriastraße 32-36, 56068 Koblenz</div>
          </div>

          <div>
            <div className="badge">Продукт</div>
            <div className="footer-links">
              {PRODUCT_LINKS.map((item) => (
                <Link className="navlink" key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="badge">Юридическое</div>
            <div className="footer-links">
              {LEGAL_LINKS.map((item) => (
                <Link className="navlink" key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="footer-bottom">© {new Date().getFullYear()} MPU Praxis DP</div>
      </footer>
    </>
  );
}
