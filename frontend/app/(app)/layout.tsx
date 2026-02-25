import type { ReactNode } from "react";
import AccountMenu from "@/app/_components/AccountMenu";

export default function CabinetLayout({ children }: { children: ReactNode }) {
  return (
    <div className="cabinet-v2-shell">
      <header className="cabinet-v2-header">
        <div className="cabinet-v2-header-inner">
          <div className="cabinet-v2-brand">
            <span className="cabinet-v2-dot" />
            <span>MPU Praxis</span>
          </div>
          <AccountMenu />
        </div>
      </header>
      {children}
    </div>
  );
}
