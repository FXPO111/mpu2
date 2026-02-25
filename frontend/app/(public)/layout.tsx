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
          <div className="container topstrip-inner public-topstrip-inner">
            <span>MPU Praxis DP • структурированная онлайн-подготовка к MPU</span>
            <a href="mailto:info@mpu-praxis-dp.de">info@mpu-praxis-dp.de</a>
          </div>
        </div>

        <div className="container public-header-inner public-header-inner-polished">
          <Link href="/" className="brand">
            <span className="brand-dot" />
            MPU Praxis DP
          </Link>

          <nav className="nav public-nav-polished" aria-label="Основная навигация">
            {MENU.map((item) => (
              <Link key={item.href} href={item.href} className="navlink">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="public-header-controls public-header-controls-polished">
            <div className="header-actions header-actions-polished">
              <Link href="/diagnostic">
                <Button size="sm">Начать диагностику</Button>
              </Link>
            </div>

            <div className="public-account-wrap public-account-wrap-polished">
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

      <style jsx>{`
        .public-topstrip-inner {
          gap: 20px;
          flex-wrap: wrap;
        }

        .public-header-inner-polished {
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 18px;
        }

        .public-nav-polished {
          justify-content: center;
          flex-wrap: nowrap;
          white-space: nowrap;
          overflow-x: auto;
          padding-bottom: 2px;
          scrollbar-width: none;
        }

        .public-nav-polished::-webkit-scrollbar {
          display: none;
        }

        .public-header-controls-polished {
          margin-left: auto;
          gap: 10px;
        }

        .header-actions-polished {
          flex: 0 0 auto;
        }

        .public-account-wrap-polished {
          min-width: 0;
          flex: 0 0 auto;
        }

        @media (max-width: 1220px) {
          .public-header-inner-polished {
            grid-template-columns: auto 1fr;
            grid-template-areas:
              "brand controls"
              "nav nav";
            row-gap: 10px;
          }

          .public-header-inner-polished :global(.brand) {
            grid-area: brand;
          }

          .public-header-inner-polished :global(.public-header-controls-polished) {
            grid-area: controls;
          }

          .public-nav-polished {
            grid-area: nav;
          }
        }

        @media (max-width: 760px) {
          .public-header-inner-polished {
            grid-template-columns: 1fr;
            grid-template-areas:
              "brand"
              "controls"
              "nav";
            gap: 10px;
          }

          .public-header-controls-polished {
            width: 100%;
            justify-content: space-between;
            margin-left: 0;
            flex-wrap: wrap;
          }

          .header-actions-polished {
            width: 100%;
          }

          .header-actions-polished :global(a) {
            width: 100%;
          }

          .header-actions-polished :global(.btn) {
            width: 100%;
          }

          .public-account-wrap-polished {
            width: 100%;
            justify-content: flex-start;
          }

          .public-nav-polished {
            justify-content: flex-start;
            flex-wrap: nowrap;
          }
        }
      `}</style>
    </>
  );
}
