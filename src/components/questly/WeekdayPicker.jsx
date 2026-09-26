import { WEEKDAYS } from "@/lib/questlyData";
import { cn } from "@/lib/utils";

// Selección de días para quests "custom_days" (0 = lunes … 6 = domingo).
export default function WeekdayPicker({ days = [], onChange }) {
  const toggle = (i) => {
    if (days.includes(i)) onChange(days.filter((d) => d !== i));
    else onChange([...days, i].sort((a, b) => a - b));
  };
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {WEEKDAYS.map((d) => (
        <button
          key={d.i}
          type="button"
          onClick={() => toggle(d.i)}
          title={d.label}
          className={cn(
            "rounded-xl border py-2 text-xs font-semibold transition-colors",
            days.includes(d.i)
              ? "bg-violet-600 border-violet-600 text-white"
              : "bg-white border-slate-200 text-slate-600 hover:border-violet-300"
          )}
        >
          {d.short}
        </button>
      ))}
    </div>
  );
}