import { Progress } from "@/components/ui/progress";
import { X } from "lucide-react";
import { fmtMoney, fmtPoints } from "@/lib/questlyApi";

// 🎯 Metas: recompensas elegidas como objetivo de acumulación. Orden: las
// alcanzadas primero, luego la más cercana — nunca se ocultan por estar lejos.
// El porcentaje se limita visualmente a 100%.
export default function GoalsList({ goals = [], points, onRemove }) {
  if (!goals.length) return null;
  const reached = (g) => points >= g.cost;
  const sorted = goals.slice().sort((a, b) => (reached(b) - reached(a)) || (a.cost - b.cost));
  return (
    <ul className="space-y-3">
      {sorted.map((g) => {
        const pct = Math.min(100, Math.round((points / g.cost) * 100));
        return (
          <li key={g.id} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <span className="h-11 w-11 rounded-xl bg-amber-50 grid place-items-center text-2xl shrink-0">{g.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold leading-tight truncate">{g.title}</p>
                <p className="text-xs text-muted-foreground">
                  ⭐ {fmtPoints(points)} / {fmtPoints(g.cost)} · 💰 {fmtMoney(g.cost)}
                </p>
              </div>
              {reached(g) ? (
                <span className="rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 whitespace-nowrap">
                  🎉 ¡Meta alcanzada!
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 whitespace-nowrap">
                  Te faltan ⭐ {fmtPoints(g.cost - points)}
                </span>
              )}
              {onRemove ? (
                <button type="button" className="h-8 w-8 grid place-items-center rounded-full text-slate-400 hover:bg-slate-100"
                  title="Quitar meta" onClick={() => onRemove(g)}>
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <Progress className="h-3 mt-3" value={pct} />
            <p className="text-xs text-muted-foreground mt-1">{pct}% de la meta</p>
          </li>
        );
      })}
    </ul>
  );
}