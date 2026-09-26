import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fmtPoints } from "@/lib/questlyApi";

// "¿Cómo se realizó esta tarea?" — solo ✅ 100% o 🟡 25%; la opción de no
// realizada ya existe en la revisión normal del adulto.
export function HowDoneDialog({ open, title, points, busy, onChoose, onClose }) {
  const quarter = Math.round(points * 0.25 * 10) / 10;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm text-center">
        <DialogTitle className="text-lg font-extrabold">¿Cómo se realizó esta tarea?</DialogTitle>
        <p className="text-sm text-muted-foreground -mt-1">{title}</p>
        <div className="mt-3 grid gap-2">
          <Button className="bg-emerald-600 hover:bg-emerald-700 font-bold h-11"
            disabled={busy} onClick={() => onChoose("full")}>
            ✅ Correctamente +{fmtPoints(points)} (100%)
          </Button>
          <Button className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-11"
            disabled={busy} onClick={() => onChoose("partial")}>
            🟡 A medias +{fmtPoints(quarter)} (25%)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 🚫 No aplica: 0 puntos, sin penalización, sin romper rachas — con un
// comentario opcional que queda registrado en la instancia.
export function NoAplicaDialog({ open, title, busy, onConfirm, onClose }) {
  const [comment, setComment] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setComment(""); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="text-lg font-extrabold">🚫 No aplica</DialogTitle>
        <p className="text-sm text-muted-foreground -mt-1">
          {title}: 0 puntos, sin penalización y no rompe rachas.
        </p>
        <Textarea
          placeholder="¿Por qué no aplicó? (opcional) — p. ej. «No estábamos en casa»"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={140}
        />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" disabled={busy}
            onClick={() => { setComment(""); onClose(); }}>
            Volver
          </Button>
          <Button disabled={busy} onClick={() => onConfirm(comment)}>
            Marcar como no aplica
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}