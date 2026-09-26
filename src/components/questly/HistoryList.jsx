import { KIND_LABELS } from "@/lib/questlyData";
import { fmtMoney, fmtSigned, fmtWhen } from "@/lib/questlyApi";

export default function HistoryList({ entries = [] }) {
  if (!entries.length) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Aún no hay movimientos.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {entries.map((h) => {
        const positive = Number(h.delta) > 0;
        return (
          <li key={h.id} className="flex items-center gap-3 py-3">
            <span className="font-mono text-sm font-bold w-20 text-right shrink-0"
              style={{ color: positive ? "#059669" : "#e11d48" }}>
              ⭐ {fmtSigned(h.delta)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{h.reason}</p>
              <p className="text-xs text-muted-foreground">
                {KIND_LABELS[h.kind] ? KIND_LABELS[h.kind] + " · " : ""}
                {fmtWhen(h.at)}
                {h.actor ? " · " + h.actor : ""}
              </p>
            </div>
            {h.balance_after !== null && h.balance_after !== undefined ? (
              <span className="text-xs text-muted-foreground shrink-0">→ ⭐ {fmtMoney(h.balance_after)}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}