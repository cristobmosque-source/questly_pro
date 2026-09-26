// Datos estáticos espejo de questly/app/models.py (solo para pickers visuales;
// el backend sigue siendo la fuente de verdad).

export const AVATARS = [
  "🦊", "🐼", "🦄", "🐯", "🐸", "🐙", "🦖", "🐨", "🦉", "🐝",
  "🐬", "🦁", "🐧", "🐴", "🐵", "🦔", "🐻", "🐔", "🐠", "🦩",
];

export const COLORS = [
  "#7c4dff", "#ff4d94", "#12d6a0", "#28c8f5",
  "#ffb300", "#ff7043", "#e040fb", "#8bc34a",
];

export const WEEKDAYS = [
  { i: 0, short: "Lun", label: "Lunes" },
  { i: 1, short: "Mar", label: "Martes" },
  { i: 2, short: "Mié", label: "Miércoles" },
  { i: 3, short: "Jue", label: "Jueves" },
  { i: 4, short: "Vie", label: "Viernes" },
  { i: 5, short: "Sáb", label: "Sábado" },
  { i: 6, short: "Dom", label: "Domingo" },
];

export const REPEAT_OPTIONS = [
  { value: "daily", label: "Cada día" },
  { value: "weekly", label: "Cada semana" },
  { value: "once", label: "Una sola vez" },
  { value: "custom_days", label: "Días que yo elija" },
];

export const KIND_LABELS = {
  quest: "Quest",
  partial: "Hecha a medias",
  streak: "Racha",
  redeem: "Recompensa",
  award: "Puntos dados",
  deduct: "Puntos quitados",
  missed: "No realizada",
  refund: "Reembolso",
};

export function daysSummary(days) {
  const set = [...(days || [])].sort();
  const eq = (a) => set.length === a.length && a.every((d, idx) => set[idx] === d);
  if (eq([0, 1, 2, 3, 4])) return "Lunes a viernes";
  if (eq([5, 6])) return "Fin de semana";
  if (eq([0, 1, 2, 3, 4, 5, 6])) return "Todos los días";
  return set.map((d) => WEEKDAYS[d]?.short).filter(Boolean).join(", ");
}

export function repeatLabel(quest) {
  switch (quest.repeat) {
    case "daily": return "Cada día";
    case "weekly": return "Cada semana";
    case "once": return "Una vez";
    case "custom_days": return daysSummary(quest.repeat_days);
    default: return quest.repeat;
  }
}

export const STATE_META = {
  open: { label: "Por hacer", className: "bg-emerald-100 text-emerald-700" },
  pending: { label: "Por revisar", className: "bg-amber-100 text-amber-700" },
  done: { label: "¡Hecha!", className: "bg-violet-100 text-violet-700" },
  missed: { label: "No realizada", className: "bg-rose-100 text-rose-700" },
  rejected: { label: "Rechazada", className: "bg-slate-200 text-slate-600" },
};