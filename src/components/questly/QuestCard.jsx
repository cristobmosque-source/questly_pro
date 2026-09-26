import { Check, Clock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import StateChip from "@/components/questly/StateChip";
import { fmtPoints } from "@/lib/questlyApi";
import { cn } from "@/lib/utils";

// Tarjeta grande de quest para el niño: emoji, puntos, subtareas y acción.
export default function QuestCard({ quest, onClaim, onToggleStep, busy = false }) {
  const stepsLeft = quest.steps_total - quest.steps_done;
  const repeatable = quest.limit > 1;

  return (
    <div className="rounded-3xl bg-white shadow-sm border border-slate-100 p-5">
      <div className="flex items-start gap-4">
        <span className="h-14 w-14 shrink-0 rounded-2xl bg-violet-50 grid place-items-center text-3xl">
          {quest.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="text-lg font-bold leading-tight">{quest.title}</h3>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-sm font-extrabold text-amber-700">
              <Star className="h-3.5 w-3.5" /> {fmtPoints(quest.points)}
            </span>
          </div>
          {quest.description ? (
            <p className="text-sm text-muted-foreground mt-1">{quest.description}</p>
          ) : null}
        </div>
      </div>

      {quest.subtasks.length ? (
        <div className="mt-4">
          <ul className="space-y-1.5">
            {quest.subtasks.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={busy || quest.state === "missed"}
                  onClick={() => onToggleStep && onToggleStep(quest, s.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    quest.state === "missed" ? "opacity-60" : "hover:bg-slate-50"
                  )}
                >
                  <span className={cn(
                    "h-6 w-6 shrink-0 rounded-full grid place-items-center border-2 transition-colors",
                    s.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"
                  )}>
                    {s.done ? <Check className="h-4 w-4" /> : null}
                  </span>
                  <span className={cn("font-medium", s.done && "line-through text-slate-400")}>
                    {s.text}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Progress className="mt-3 h-2.5" value={quest.steps_total ? (quest.steps_done / quest.steps_total) * 100 : 0} />
          <p className="text-xs text-muted-foreground mt-1 text-right">
            {quest.steps_done}/{quest.steps_total} pasos
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        {repeatable && quest.state !== "missed" ? (
          <span className="text-xs font-semibold text-muted-foreground">
            {quest.used}/{quest.limit} veces hoy
          </span>
        ) : null}
        <div className="ml-auto">
          {quest.state === "open" ? (
            <Button
              size="lg"
              disabled={busy || stepsLeft > 0}
              onClick={() => onClaim && onClaim(quest)}
              className="rounded-2xl h-11 px-6 text-base font-extrabold bg-emerald-600 hover:bg-emerald-700"
            >
              {stepsLeft > 0 ? `Faltan ${stepsLeft} pasos` : "¡La hice!"}
            </Button>
          ) : quest.state === "pending" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3.5 py-2 text-sm font-bold text-amber-700">
              <Clock className="h-4 w-4" /> Por revisar
            </span>
          ) : (
            <StateChip state={quest.state} />
          )}
        </div>
      </div>
    </div>
  );
}