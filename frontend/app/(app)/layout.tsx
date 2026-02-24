import type { ReactNode } from "react";
import AccountMenu from "@/app/_components/AccountMenu";

export default function CabinetLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header style={{ padding: 12, borderBottom: "1px solid #ddd", display: "flex", justifyContent: "flex-end" }}>
        <AccountMenu />
      </header>
      {children}
    </>
  );
}
