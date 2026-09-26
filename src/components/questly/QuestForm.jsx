import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import WeekdayPicker from "@/components/questly/WeekdayPicker";
import EmojiField from "@/components/questly/EmojiField";
import { REPEAT_OPTIONS } from "@/lib/questlyData";
import { suggestEmoji, EMOJI_FALLBACK } from "@/lib/emojiAuto";
import { cn } from "@/lib/utils";

// Formulario compartido para crear y editar quests (los campos exactos que
// espera el backend; la validación de reglas ocurre en el servidor).
export default function QuestForm({ initial, kids, onSubmit, submitting, submitLabel = "Guardar" }) {
  const [form, setForm] = useState(() => ({
    title: initial?.title || "",
    emoji: initial?.emoji || "",
    points: initial?.points ?? 5,
    repeat: initial?.repeat || "daily",
    repeat_days: initial?.repeat_days || [],
    times_per_period: initial?.times_per_period ?? 1,
    description: initial?.description || "",
    subtasks: (initial?.subtasks || []).map((s) => s.text).join("\n"),
    assigned_to: initial?.assigned_to || [],
    due_date: initial?.due_date || "",
  }));
  // El emoji de una quest nueva se deduce del título; al editar una quest
  // existente se respeta su emoji salvo que el adulto lo cambie a mano.
  const [emojiMode, setEmojiMode] = useState(initial?.emoji ? "manual" : "auto");

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  // Mientras el emoji sea automático, sigue al título; si el adulto lo
  // eligió a mano, editar el título ya no lo reemplaza.
  const setTitle = (value) =>
    setForm((f) => ({
      ...f,
      title: value,
      ...(emojiMode === "auto" ? { emoji: suggestEmoji(value) } : {}),
    }));
  const isAllKids = form.assigned_to.length === 0;

  const toggleKid = (id) => {
    setForm((f) => ({
      ...f,
      assigned_to: f.assigned_to.includes(id)
        ? f.assigned_to.filter((k) => k !== id)
        : [...f.assigned_to, id],
    }));
  };

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      title: form.title.trim(),
      emoji: form.emoji || EMOJI_FALLBACK,
      points: Number(form.points) || 5,
      times_per_period: Number(form.times_per_period) || 1,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-[1fr_4.5rem_6rem] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="q-title">Título</Label>
          <Input id="q-title" required maxLength={80} value={form.title}
            onChange={(e) => setTitle(e.target.value)} placeholder="Hacer la cama" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-emoji">{emojiMode === "auto" ? "Emoji (auto)" : "Emoji"}</Label>
          <div id="q-emoji">
            <EmojiField
              emoji={form.emoji || EMOJI_FALLBACK}
              mode={emojiMode}
              onPick={(e) => { setEmojiMode("manual"); set("emoji")(e); }}
              onAuto={() => { setEmojiMode("auto"); set("emoji")(suggestEmoji(form.title)); }}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-points">Puntos</Label>
          <Input id="q-points" type="number" min={1} max={100000} step={1} required
            value={form.points} onChange={(e) => set("points")(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Repetición</Label>
        <Select value={form.repeat} onValueChange={set("repeat")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {REPEAT_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {form.repeat === "custom_days" ? (
        <div className="space-y-1.5">
          <Label>Repetir los días</Label>
          <WeekdayPicker days={form.repeat_days} onChange={set("repeat_days")} />
          {!form.repeat_days.length ? (
            <p className="text-xs text-rose-500">Elige al menos un día.</p>
          ) : null}
        </div>
      ) : null}

      {form.repeat === "once" ? (
        <div className="space-y-1.5">
          <Label htmlFor="q-due">Fecha límite (opcional)</Label>
          <Input id="q-due" type="date" value={form.due_date || ""}
            onChange={(e) => set("due_date")(e.target.value)} />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="q-times">Veces por período</Label>
          <Input id="q-times" type="number" min={1} max={20}
            value={form.times_per_period} onChange={(e) => set("times_per_period")(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Asignación</Label>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button type="button"
              onClick={() => set("assigned_to")([])}
              className={cn("rounded-full border px-3 py-1 text-xs font-semibold",
                isAllKids ? "bg-violet-600 border-violet-600 text-white"
                  : "bg-white border-slate-200 text-slate-600")}>
              Todos los niños
            </button>
            {kids.map((k) => (
              <button key={k.id} type="button" onClick={() => toggleKid(k.id)}
                className={cn("rounded-full border px-3 py-1 text-xs font-semibold",
                  form.assigned_to.includes(k.id)
                    ? "bg-violet-600 border-violet-600 text-white"
                    : "bg-white border-slate-200 text-slate-600")}>
                {k.avatar} {k.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="q-desc">Descripción (opcional)</Label>
        <Textarea id="q-desc" rows={2} maxLength={240}
          value={form.description} onChange={(e) => set("description")(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="q-steps">Subtareas — una por línea (opcional)</Label>
        <Textarea id="q-steps" rows={3}
          value={form.subtasks} onChange={(e) => set("subtasks")(e.target.value)}
          placeholder={"Poner la alarma\nLavarse los dientes"} />
      </div>

      <Button type="submit" disabled={submitting} className="w-full font-bold">
        {submitting ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}