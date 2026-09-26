import StateChip from "@/components/questly/StateChip";
import { fmtPoints } from "@/lib/questlyApi";

// Lista compacta de instancias de un día (AYER/HOY): emoji, título, puntos y
// estado. Las pasadas sin resolver se ven como "⚠️ Sin registrar" (la
// penalización nunca es automática). `actions` inyecta botones extra por fila.
export default function DayQuestList({ items = [], actions }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground py-2">Sin quests este día.</p>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((q) => (
        <li key={q.id} className="py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-xl shrink-0">{q.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{q.title}</p>
            <p className="text-xs text-muted-foreground">
              ⭐ {fmtPoints(q.points)}
              {q.state === "missed" && q.penalty_applied
                ? ` · penalización -${fmtPoints(q.penalty)}` : ""}
              {q.comment ? ` · 🚫 ${q.comment}` : ""}
            </p>
          </div>
          {q.state === "pending_review" ? (
            <span className="text-xs font-bold rounded-full px-2.5 py-1 bg-amber-100 text-amber-800">
              ⚠️ Sin registrar
            </span>
          ) : (
            <StateChip state={q.state} />
          )}
          {actions ? actions(q) : null}
        </li>
      ))}
    </ul>
  );
}