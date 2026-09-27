import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fmtMoney, fmtPoints } from "@/lib/questlyApi";
import { cn } from "@/lib/utils";

// Tarjeta de recompensa para el niño, con costo y disponibilidad tal como
// los calcula el backend (stock_text).
export default function RewardCard({ reward, points, isGoal, onBuy, onSetGoal, busy }) {
  const canBuy = points >= reward.cost && !reward.sold_out;
  return (
    <div className={cn(
      "rounded-3xl bg-white border shadow-sm p-5 flex flex-col",
      isGoal ? "border-amber-300 ring-2 ring-amber-200" : "border-slate-100"
    )}>
      <div className="flex items-start gap-3">
        <span className="h-12 w-12 rounded-2xl bg-violet-50 grid place-items-center text-2xl">
          {reward.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold leading-tight">{reward.title}</h3>
          <p className="text-xs text-muted-foreground">
            💰 {fmtMoney(reward.cost)}{reward.stock_text ? " · " + reward.stock_text : ""}
          </p>
          <p className={"text-xs font-bold " + (reward.sold_out ? "text-rose-500" : canBuy ? "text-emerald-600" : "text-amber-600")}>
            {reward.sold_out ? "Agotada" : canBuy ? "✓ ¡Puedes canjearla!" : `Te faltan ⭐ ${fmtPoints(reward.cost - points)}`}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-sm font-extrabold text-amber-700">
          <Star className="h-3.5 w-3.5" /> {fmtPoints(reward.cost)}
        </span>
      </div>

      {reward.description ? (
        <p className="text-sm text-muted-foreground mt-2">{reward.description}</p>
      ) : null}

      {isGoal && points < reward.cost ? (
        <div className="mt-3">
          <Progress className="h-2.5" value={(points / reward.cost) * 100} />
          <p className="text-xs text-muted-foreground mt-1">
            Te faltan {fmtPoints(reward.cost - points)} puntos
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Button
          className="flex-1 font-bold rounded-xl"
          disabled={!canBuy || busy}
          onClick={() => onBuy && onBuy(reward)}
        >
          {reward.sold_out ? "Agotada" : canBuy ? "¡La quiero!" : `Te faltan ${fmtPoints(reward.cost - points)}`}
        </Button>
        <Button
          variant={isGoal ? "default" : "outline"}
          className="rounded-xl"
          disabled={busy}
          onClick={() => onSetGoal && onSetGoal(reward)}
          title={isGoal ? "Quitar como meta" : "Poner como meta"}
        >
          🎯
        </Button>
      </div>
    </div>
  );
}