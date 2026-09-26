import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KIND_LABELS } from "@/lib/questlyData";
import { fmtMoney, fmtSigned, fmtWhen } from "@/lib/questlyApi";
import { cn } from "@/lib/utils";

// Línea de auditoría de un movimiento: qué papel tuvo cada quien. Usa solo los
// campos que existan — los movimientos antiguos se muestran sin inventar datos.
export function txnActorLine(h) {
  const actor = h.actor_name || h.actor || null;
  const origin = h.origin ? (h.origin_name || (h.origin === "parent" ? "el adulto" : "el niño")) : null;
  switch (h.kind) {
    case "quest":
    case "partial":
      if (h.origin === "kid" && origin)
        return "Marcada por " + origin + (actor ? " · Aprobada por " + actor : "");
      return actor ? "Decisión de " + actor : "";
    case "missed":
      if (h.origin === "kid" && origin)
        return "Dijo que la hizo · Decidida por " + (actor || "el adulto");
      return actor ? "Marcada como no realizada por " + actor : "No realizada";
    case "award":
      return actor ? "Puntos dados por " + actor : "";
    case "deduct":
      return actor ? "Puntos quitados por " + actor : "";
    case "redeem":
      return "Canjeada por " + (actor || origin || "el niño");
    case "refund":
      return "Reembolsada por " + (actor || "el adulto");
    case "streak":
      return "Racha completada" + (actor ? " — decidida por " + actor : "");
    case "reversal":
      return "Reversión — revertida por " + (actor || "el adulto");
    default:
      return actor || "";
  }
}

// Nombre de quien ejecutó la acción (para el filtro "Realizado por").
export function txnActorName(h) {
  return h.actor_name || h.actor || h.origin_name || null;
}

// Categoría de un movimiento (para el filtro del historial del adulto).
export function txnCategory(h) {
  if (h.kind === "reversal") return "reversal";
  if (["quest", "partial", "missed"].includes(h.kind)) return "quest";
  if (["redeem", "refund"].includes(h.kind)) return "reward";
  if (["award", "deduct"].includes(h.kind)) return "adjust";
  if (h.kind === "streak") return "streak";
  return "other";
}

// Libro de movimientos: beneficiario, actor, motivo, fecha y reversión.
// canUndo (solo adulto) muestra "Deshacer" en los movimientos revertibles.
export default function HistoryList({ entries = [], canUndo = false, onReverse, busy = false }) {
  if (!entries.length) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Aún no hay movimientos.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {entries.map((h) => {
        const positive = Number(h.delta) > 0;
        const line = txnActorLine(h);
        const isReversal = h.kind === "reversal";
        return (
          <li key={h.id} className="flex items-center gap-3 py-3">
            <span className={cn("font-mono text-sm font-bold w-20 text-right shrink-0",
              positive ? "text-emerald-600" : "text-rose-600")}>
              ⭐ {fmtSigned(h.delta)}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm font-medium", isReversal && "italic text-slate-500")}>
                {h.kid_name ? <span className="font-bold">{h.kid_name}: </span> : null}
                {h.reason}
              </p>
              <p className="text-xs text-muted-foreground">
                {line ? line + " · " : ""}
                {KIND_LABELS[h.kind] ? KIND_LABELS[h.kind] + " · " : ""}
                {fmtWhen(h.at)}
              </p>
              {h.status === "reversed" ? (
                <p className="text-xs font-semibold text-amber-700 mt-0.5">
                  ↩️ Revertido por {h.reversed_by || "el adulto"}{h.reversed_at ? " · " + fmtWhen(h.reversed_at) : ""}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {h.balance_after !== null && h.balance_after !== undefined ? (
                <span className="text-xs text-muted-foreground">→ ⭐ {fmtMoney(h.balance_after)}</span>
              ) : null}
              {canUndo && h.reversible ? (
                <Button size="sm" variant="ghost" disabled={busy}
                  className="h-7 px-2 text-xs text-violet-700 hover:text-violet-800"
                  onClick={() => onReverse && onReverse(h)}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" /> Deshacer
                </Button>
              ) : null}
              {canUndo && h.status === "reversed" ? (
                <span className="text-[11px] font-bold text-amber-600">Ya revertido</span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}