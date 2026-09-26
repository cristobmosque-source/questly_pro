import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Formulario de racha: quest existente + tipo (días consecutivos / cantidad de
// veces) + niño o todos + recompensa + repetible + activa.
export default function StreakForm({ initial, quests, kids, onSubmit, submitting, submitLabel }) {
  const [form, setForm] = useState(() => ({
    name: initial?.name || "",
    quest_id: initial?.quest_id || quests[0]?.id || "",
    type: initial?.type || "days",
    target: initial?.target ?? 7,
    reward_points: initial?.reward_points ?? 500,
    kid_id: initial?.kid_id ?? "all",
    repeatable: initial ? !!initial.repeatable : false,
    active: initial ? !!initial.active : true,
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...form, kid_id: form.kid_id === "all" ? null : form.kid_id });
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="s-name">Nombre</Label>
        <Input id="s-name" required maxLength={60} value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Racha de la cama" />
      </div>
      <div className="space-y-1.5">
        <Label>Quest</Label>
        <Select value={form.quest_id} onValueChange={(v) => set("quest_id", v)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar quest" /></SelectTrigger>
          <SelectContent>
            {quests.map((q) => (
              <SelectItem key={q.id} value={q.id}>{q.emoji} {q.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={form.type} onValueChange={(v) => set("type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="days">🔥 Días consecutivos</SelectItem>
              <SelectItem value="times">⭐ Número de veces</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-target">{form.type === "days" ? "Días" : "Cantidad (veces)"}</Label>
          <Input id="s-target" type="number" min={1} max={365} required
            value={form.target} onChange={(e) => set("target", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Asignar a</Label>
        <Select value={form.kid_id} onValueChange={(v) => set("kid_id", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los niños</SelectItem>
            {kids.map((k) => (
              <SelectItem key={k.id} value={k.id}>{k.avatar} {k.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Cada niño tiene su propio progreso.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-reward">Recompensa (puntos)</Label>
        <Input id="s-reward" type="number" min={1} max={100000} required
          value={form.reward_points} onChange={(e) => set("reward_points", e.target.value)} />
      </div>
      <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
        <div>
          <p className="text-sm font-semibold">Repetible</p>
          <p className="text-xs text-muted-foreground">Al completarla empieza una nueva ronda</p>
        </div>
        <Switch checked={form.repeatable} onCheckedChange={(v) => set("repeatable", v)} />
      </div>
      <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
        <p className="text-sm font-semibold">Activa</p>
        <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
      </div>
      <Button type="submit" disabled={submitting} className="w-full font-bold">
        {submitting ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}