import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Delete, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import { api, setSession } from "@/lib/questlyApi";
import { cn } from "@/lib/utils";

// Pantalla de entrada: ¿quién eres? Niños con avatar (y PIN si tienen),
// adulto con correo y contraseña, o configuración inicial la primera vez.
export default function EntryScreen() {
  const navigate = useNavigate();
  const [boot, setBoot] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState("who"); // who | pin | parent | setup
  const [selectedKid, setSelectedKid] = useState(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [parentForm, setParentForm] = useState({ email: "", password: "" });
  const [setupForm, setSetupForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api("/bootstrap");
      setBoot(data);
      setView(data.has_parent ? "who" : "setup");
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const enter = (data) => {
    setSession(data.token, data.user);
    navigate(data.user.role === "kid" ? "/kid" : "/parent", { replace: true });
  };

  const tryKid = async (kid) => {
    setSelectedKid(kid);
    setPin("");
    setFormError("");
    if (kid.has_pin) {
      setView("pin");
      return;
    }
    setBusy(true);
    try {
      enter(await api("/auth/kid", { method: "POST", body: { kid_id: kid.id, pin: "" } }));
    } catch (e) {
      setFormError(e.message);
      setView("who");
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async () => {
    setBusy(true);
    setFormError("");
    try {
      enter(await api("/auth/kid", { method: "POST", body: { kid_id: selectedKid.id, pin } }));
    } catch (e) {
      setFormError(e.message);
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const submitParent = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      enter(await api("/auth/parent", { method: "POST", body: parentForm }));
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitSetup = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      enter(await api("/setup", { method: "POST", body: setupForm }));
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!boot) return <Loading label="Buscando a la familia…" />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-100 via-sky-50 to-emerald-50 flex flex-col">
      <div className="max-w-md w-full mx-auto px-5 py-10 flex-1">
        <h1 className="text-center text-3xl font-extrabold tracking-tight">
          <span className="bg-violet-600 text-white rounded-xl px-2.5 py-1 mr-2">Q</span>
          Questly
        </h1>
        <p className="text-center text-sm text-muted-foreground mt-1">Quests, puntos y recompensas</p>

        {view === "setup" ? (
          <form onSubmit={submitSetup} className="mt-8 space-y-3 bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-lg">Bienvenido — crea tu cuenta de adulto</h2>
            {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="su-name">Tu nombre</Label>
              <Input id="su-name" required value={setupForm.name}
                onChange={(e) => setSetupForm({ ...setupForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-email">Correo electrónico</Label>
              <Input id="su-email" type="email" required value={setupForm.email}
                onChange={(e) => setSetupForm({ ...setupForm, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-pass">Contraseña (mínimo 8 caracteres)</Label>
              <Input id="su-pass" type="password" required value={setupForm.password}
                onChange={(e) => setSetupForm({ ...setupForm, password: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-pass2">Confirmar contraseña</Label>
              <Input id="su-pass2" type="password" required value={setupForm.confirm}
                onChange={(e) => setSetupForm({ ...setupForm, confirm: e.target.value })} />
            </div>
            <Button type="submit" disabled={busy} className="w-full font-bold">Comenzar</Button>
          </form>
        ) : null}

        {view === "who" ? (
          <>
            <h2 className="mt-10 text-center text-xl font-bold">¿Quién eres?</h2>
            {formError ? <p className="mt-3 text-center text-sm text-rose-600">{formError}</p> : null}
            <div className="mt-6 grid grid-cols-3 gap-4">
              {boot.kids.map((kid) => (
                <button key={kid.id} disabled={busy} onClick={() => tryKid(kid)}
                  className="flex flex-col items-center gap-2 rounded-3xl bg-white border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow active:scale-95">
                  <span className="h-16 w-16 rounded-full grid place-items-center text-4xl"
                    style={{ backgroundColor: (kid.color || "#7c4dff") + "2e" }}>
                    {kid.avatar || "🦊"}
                  </span>
                  <span className="text-sm font-bold truncate max-w-full">{kid.name}</span>
                </button>
              ))}
              {!boot.kids.length ? (
                <p className="col-span-3 text-center text-sm text-muted-foreground py-4">
                  Aún no hay niños — entra como adulto y agrégalos.
                </p>
              ) : null}
            </div>
            <button onClick={() => { setView("parent"); setFormError(""); }}
              className="mt-8 w-full flex items-center justify-center gap-2 rounded-2xl bg-white border border-slate-200 py-3 font-semibold text-slate-600 hover:bg-slate-50">
              <LockKeyhole className="h-4 w-4" /> Soy adulto
            </button>
          </>
        ) : null}

        {view === "pin" && selectedKid ? (
          <div className="mt-10 flex flex-col items-center">
            <span className="h-20 w-20 rounded-full grid place-items-center text-5xl"
              style={{ backgroundColor: (selectedKid.color || "#7c4dff") + "2e" }}>
              {selectedKid.avatar}
            </span>
            <p className="mt-3 font-bold text-lg">Hola, {selectedKid.name}</p>
            <p className="text-sm text-muted-foreground">Escribe tu PIN</p>
            {formError ? <p className="mt-2 text-sm text-rose-600">{formError}</p> : null}
            <div className="flex gap-2.5 mt-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className={cn("h-3.5 w-3.5 rounded-full",
                  i < pin.length ? "bg-violet-600" : "bg-slate-200")} />
              ))}
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-xs">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} disabled={busy || pin.length >= 6}
                  onClick={() => setPin(pin + d)}
                  className="rounded-2xl bg-white border border-slate-200 py-4 text-xl font-bold shadow-sm active:scale-95">
                  {d}
                </button>
              ))}
              <button onClick={() => setPin(pin.slice(0, -1))} disabled={busy || !pin.length}
                className="rounded-2xl bg-white border border-slate-200 py-4 grid place-items-center shadow-sm active:scale-95">
                <Delete className="h-5 w-5 text-slate-500" />
              </button>
              <button disabled={busy || pin.length < 4} onClick={submitPin}
                className="rounded-2xl bg-violet-600 text-white py-4 text-xl font-bold shadow-sm active:scale-95 disabled:opacity-40">
                ✓
              </button>
            </div>
          </div>
        ) : null}

        {view === "parent" ? (
          <form onSubmit={submitParent} className="mt-10 space-y-3 bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-lg">Entrar como adulto</h2>
            {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="p-email">Correo electrónico</Label>
              <Input id="p-email" type="email" required value={parentForm.email}
                onChange={(e) => setParentForm({ ...parentForm, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-pass">Contraseña</Label>
              <Input id="p-pass" type="password" required value={parentForm.password}
                onChange={(e) => setParentForm({ ...parentForm, password: e.target.value })} />
            </div>
            <Button type="submit" disabled={busy} className="w-full font-bold">Entrar</Button>
            <button type="button" onClick={() => setView("who")}
              className="w-full text-sm text-muted-foreground py-1">← Volver</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}