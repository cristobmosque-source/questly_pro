import { STATE_META } from "@/lib/questlyData";
import { cn } from "@/lib/utils";

export default function StateChip({ state, className }) {
  const meta = STATE_META[state] || { label: state, className: "bg-slate-100 text-slate-600" };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
      meta.className, className)}>
      {meta.label}
    </span>
  );
}