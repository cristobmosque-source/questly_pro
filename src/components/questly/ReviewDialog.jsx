import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateLabel, fmtPoints } from "@/lib/questlyApi";

// ⚠️ Diálogo de revisión de una instancia vencida SIN registro
// ("Pendiente de revisión"): el adulto decide qué pasó —
// ✓ hecha 100% · ~ parcial 25% · ✕ no realizada −50% · — no aplica 0.
// El sistema nunca asume: nada se mueve hasta esta decisión.
export default function ReviewDialog({ open, target, busy, onResolve, onClose }) {
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) setComment("");
  }, [open]);

  if (!target) return null;
  const { title, emoji, kid_name, points, penalty, date, label } = target;
  const quarter = Math.round(points * 0.25 * 10) / 10;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">⚠️ Tarea pendiente de revisión</DialogTitle>
          <DialogDescription>
            Nadie registró esta tarea: decide tú qué pasó.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
          <p className="font-semibold text-base">
            {emoji} {title} <span className="text-amber-600 font-bold">⭐ {fmtPoints(points)}</span>
          </p>
          <p className="text-slate-600">Niño: <span className="font-semibold">{kid_name}</span></p>
          <p className="text-slate-600">{date ? "Fecha: " + fmtDateLabel(date) : "Período: " + label}</p>
          <p className="text-slate-600">Estado: <span className="font-semibold text-amber-700">No registrada</span></p>
        </div>

        <Textarea
          placeholder="Comentario (opcional) — p. ej. «La hizo pero olvidó marcarla»"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={140}
        />

        <div className="grid gap-2">
          <Button className="bg-emerald-600 hover:bg-emerald-700 font-bold h-11" disabled={busy}
            onClick={() => onResolve("full", comment)}>
            ✓ Marcar como hecha +{fmtPoints(points)} (100%)
          </Button>
          <Button className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-11" disabled={busy}
            onClick={() => onResolve("partial", comment)}>
            ~ Marcar como parcial +{fmtPoints(quarter)} (25%)
          </Button>
          <Button variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 font-bold h-11"
            disabled={busy}
            onClick={() => onResolve("not_done", comment)}>
            ✕ Marcar como no realizada −{fmtPoints(penalty)} (50%)
          </Button>
          <Button variant="outline" className="text-slate-600 border-slate-300 hover:bg-slate-50 font-bold h-11"
            disabled={busy}
            onClick={() => onResolve("not_applicable", comment)}>
            — No aplica (0 puntos)
          </Button>
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}