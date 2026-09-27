import { fmtPoints } from "@/lib/questlyApi";

// 🔥 Mis rachas — progreso propio del niño con barra y mensaje motivador.
export default function KidStreaks({ streaks = [], color = "#7c4dff", title = "🔥 Mis rachas" }) {
  if (!streaks.length) return null;
  return (
    <section className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5">
      <h2 className="font-extrabold text-lg">{title}</h2>
      <ul className="mt-3 space-y-5">
        {streaks.map((s) => {
          const unit = s.type === "days" ? (s.remaining === 1 ? "día" : "días") : (s.remaining === 1 ? "vez" : "veces");
          return (
            <li key={s.id}>
              <p className="font-bold text-sm">
                {s.emoji} {s.name}
                <span className="text-muted-foreground font-normal"> · {s.quest_title}</span>
                {!s.quest_active ? <span className="text-amber-600 text-xs font-semibold"> (quest pausada)</span> : null}
              </p>
              <div className="mt-1.5 h-3.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: Math.min(100, (s.count / s.target) * 100) + "%", backgroundColor: color }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.completed
                  ? "🎉 ¡Completada! Buenísima racha."
                  : `${s.count} / ${s.target} ${s.type === "days" ? "días" : "veces"} — ¡te ${s.remaining === 1 ? "falta" : "faltan"} ${s.remaining} ${unit}!`}
                {" · Recompensa: "}
                <span className="text-amber-600 font-bold">⭐ +{fmtPoints(s.reward_points)}</span>
                {s.repeatable ? " · se repite 🔁" : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}