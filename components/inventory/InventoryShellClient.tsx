"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Bell, BriefcaseBusiness, ChartNoAxesCombined, CircleHelp,
  FileText, LayoutDashboard, LogOut, Menu, Package,
  Search, Settings, ShoppingCart, Users, Zap
} from "lucide-react";

type Props = {
  user: { email: string; name: string; role: string };
  children: React.ReactNode;
};

const nav = [
  { label: "Overview", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Inventory", icon: Package, href: "/dashboard/inventory" },
  { label: "Purchases", icon: ShoppingCart, href: "/dashboard/inventory/purchases" },
  { label: "Projects & work", icon: BriefcaseBusiness, href: "/dashboard/projects" },
  { label: "Customers", icon: Users, href: "/dashboard/customers" },
  { label: "Invoices", icon: FileText, href: null },
  { label: "Reports", icon: ChartNoAxesCombined, href: null },
];

function getBreadcrumb(pathname: string): string {
  if (pathname.startsWith("/dashboard/inventory/purchases")) return "Purchases";
  if (pathname.startsWith("/dashboard/inventory")) return "Inventory";
  if (pathname.startsWith("/dashboard/projects")) return "Projects & Work";
  if (pathname.startsWith("/dashboard/customers")) return "Customers";
  return "Overview";
}

export default function InventoryShellClient({ user, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark small"><Zap size={19} /></div>
          <div><strong>VoltDesk</strong><span>CONTRACTOR ERP</span></div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {nav.map(item => {
            const active = item.href
              ? (item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href))
              : false;
            return (
              <button
                key={item.label}
                className={`nav-item ${active ? "selected" : ""}`}
                onClick={() => {
                  if (item.href) router.push(item.href);
                  else alert(`${item.label} module is in the next development milestone.`);
                }}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => alert("Settings module is coming in the next milestone.")}>
            <Settings size={18} />Settings
          </button>
          <button className="nav-item">
            <CircleHelp size={18} />Help &amp; support
          </button>
          <div className="profile-mini">
            <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
            <div className="profile-copy">
              <strong>{user.name}</strong>
              <span>{user.role}</span>
            </div>
            <button className="icon-button" onClick={signOut} aria-label="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMobileOpen(!mobileOpen)}>
            <Menu />
          </button>
          <div className="breadcrumbs">
            Workspace <span>/</span> <strong>{getBreadcrumb(pathname)}</strong>
          </div>
          <div className="top-actions">
            <div className="search-box">
              <Search size={16} />
              <input placeholder="Search anything..." />
            </div>
            <button className="icon-button notification">
              <Bell size={18} /><i />
            </button>
            <div className="top-avatar">{user.name.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>
        <div className="content">
          {children}
        </div>
      </main>
    </div>
  );
}
