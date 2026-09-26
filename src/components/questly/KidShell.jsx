import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Gift, History, Home, LogOut } from "lucide-react";
import { api, clearSession, fmtMoney, fmtPoints, getSessionUser, notifyPointsChanged } from "@/lib/questlyApi";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/kid", label: "Inicio", icon: Home, end: true },
  { to: "/kid/shop", label: "Tienda", icon: Gift },
  { to: "/kid/history", label: "Historial", icon: History },
];

// Layout del niño: cabecera con su color propio, puntos en vivo y navegación
// grande abajo (cómoda en móvil y tablet).
export default function KidShell() {
  const user = getSessionUser();
  const navigate = useNavigate();
  const [points, setPoints] = useState(user?.points ?? 0);
  const color = user?.color || "#7c4dff";

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const data = await api("/me");
        if (alive) setPoints(data.user.points);
      } catch { /* el error lo muestra la página */ }
    };
    refresh();
    window.addEventListener("questly:points", refresh);
    return () => {
      alive = false;
      window.removeEventListener("questly:points", refresh);
    };
  }, []);

  if (!user || user.role !== "kid") return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen"
      style={{ background: `linear-gradient(180deg, ${color}1f 0%, #f8fafc 300px)` }}>
      <header className="px-4 pt-5 pb-3 max-w-3xl mx-auto flex items-center gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-14 w-14 shrink-0 rounded-full grid place-items-center text-3xl shadow-inner"
            style={{ backgroundColor: color + "33" }}>
            {user.avatar || "🦊"}
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground">¡A por esas quests!</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full bg-amber-100 border border-amber-200 px-4 py-2 font-extrabold text-amber-700 text-sm">
            ⭐ {fmtPoints(points)}
          </span>
          <span className="hidden sm:inline-flex rounded-full bg-white border border-slate-200 px-3 py-2 font-bold text-slate-600 text-xs">
            💰 {fmtMoney(points)}
          </span>
          <button
            className="h-9 w-9 grid place-items-center rounded-full bg-white border border-slate-200 text-slate-500"
            title="Salir"
            onClick={() => { clearSession(); navigate("/"); }}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-28 md:pb-10">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur border-t border-slate-200">
        <div className="max-w-3xl mx-auto grid grid-cols-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn("flex flex-col items-center gap-0.5 py-3 text-xs font-semibold",
                  isActive ? "" : "text-slate-400")
              }
              style={({ isActive }) => (isActive ? { color } : undefined)}
            >
              {({ isActive }) => (
                <>
                  <span className="rounded-2xl px-5 py-1.5 transition-colors"
                    style={isActive ? { backgroundColor: color + "1f" } : undefined}>
                    <Icon className="h-6 w-6" />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}