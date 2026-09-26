import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  CalendarCheck, ClipboardCheck, Gift, History, Home, ListChecks,
  LogOut, Settings, Users,
} from "lucide-react";
import { api, clearSession, getSessionUser, notifyApprovalsChanged } from "@/lib/questlyApi";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/parent", label: "Inicio", icon: Home, end: true },
  { to: "/parent/today", label: "Hoy", icon: CalendarCheck },
  { to: "/parent/quests", label: "Quests", icon: ListChecks },
  { to: "/parent/approvals", label: "Aprobaciones", icon: ClipboardCheck },
  { to: "/parent/rewards", label: "Recompensas", icon: Gift },
  { to: "/parent/kids", label: "Niños", icon: Users },
  { to: "/parent/history", label: "Historial", icon: History },
  { to: "/parent/settings", label: "Configuración", icon: Settings },
];

// Layout del adulto: barra superior con navegación completa y contador de
// pendientes (el adulto administra; no juega ni acumula puntos).
export default function ParentShell() {
  const user = getSessionUser();
  const navigate = useNavigate();
  const [pending, setPending] = useState(null);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const data = await api("/parent/badge");
        if (alive) setPending(data.pending);
      } catch { /* la página muestra su propio error */ }
    };
    refresh();
    window.addEventListener("questly:approvals", refresh);
    return () => {
      alive = false;
      window.removeEventListener("questly:approvals", refresh);
    };
  }, []);

  if (!user || user.role !== "parent") return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="font-extrabold text-lg tracking-tight shrink-0">
            <span className="bg-violet-600 text-white rounded-lg px-2 py-0.5 mr-2">Q</span>
            Questly
          </span>
          <nav className="flex-1 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1 min-w-max">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn("rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors",
                      isActive
                        ? "bg-violet-100 text-violet-700"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-700")
                  }
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{label}</span>
                    {to === "/parent/approvals" && pending > 0 ? (
                      <span className="rounded-full bg-amber-400 text-amber-950 text-[11px] font-bold px-1.5">
                        {pending}
                      </span>
                    ) : null}
                  </span>
                </NavLink>
              ))}
            </div>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden md:flex items-center gap-1.5 text-sm font-semibold text-slate-600">
              {user.avatar} {user.name}
            </span>
            <button
              className="h-9 w-9 grid place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              title="Salir"
              onClick={() => { clearSession(); navigate("/"); }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}