import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "VoltDesk | Electrical Contractor ERP", description: "Inventory, projects and billing for electrical contractors." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
