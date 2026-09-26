import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Delete, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import LocalDataMigration, { hasLocalQuestlyData } from "@/components/questly/LocalDataMigration";
import { api, setSession } from "@/lib/questlyApi";

// Pantalla de entrada: ¿quién eres? Perfiles de niños (con PIN) y del adulto,
// o configuración inicial la primera vez.
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

  const kidColor = (kid) => kid.color || "#7c4dff";

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

        {view === "setup" && hasLocalQuestlyData() ? (
          <LocalDataMigration onImported={load} />
        ) : null}

        {view === "who" ? (
          <>
            <h2 className="mt-10 text-center text-xl font-bold">¿Quién eres?</h2>
            {formError ? <p className="mt-3 text-center text-sm text-rose-600">{formError}</p> : null}
            <div className="mt-6 grid grid-cols-3 gap-4">
              {boot.kids.map((kid) => (
                <button key={kid.id} disabled={busy} onClick={() => tryKid(kid)}
                  className="flex flex-col items-center gap-2 rounded-3xl bg-white border-2 shadow-sm p-4 hover:shadow-md transition-all active:scale-95"
                  style={{ borderColor: kidColor(kid) + "55", backgroundColor: kidColor(kid) + "0d" }}>
                  <span className="h-16 w-16 rounded-full grid place-items-center text-4xl"
                    style={{ backgroundColor: kidColor(kid) + "2e" }}>
                    {kid.avatar || "🦊"}
                  </span>
                  <span className="text-sm font-bold truncate max-w-full">{kid.name}</span>
                </button>
              ))}
            </div>

            <button onClick={() => { setView("parent"); setFormError(""); }} disabled={busy}
              className="mt-5 w-full flex items-center gap-3 rounded-2xl bg-white border-2 border-slate-200 shadow-sm p-4 hover:shadow-md transition-all active:scale-95">
              <span className="h-12 w-12 rounded-full grid place-items-center text-2xl bg-slate-100">
                {boot.parent?.avatar || "👨"}
              </span>
              <span className="text-left min-w-0">
                <span className="block font-bold truncate">{boot.parent?.name || "Adulto"}</span>
                <span className="block text-xs text-muted-foreground flex items-center gap-1">
                  <LockKeyhole className="h-3 w-3" /> Entrar con contraseña
                </span>
              </span>
            </button>

            {!boot.kids.length ? (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Aún no hay niños — entra como adulto y agrégalos.
              </p>
            ) : null}

          </>
        ) : null}

        {view === "pin" && selectedKid ? (
          <div className="mt-10 flex flex-col items-center">
            <span className="h-20 w-20 rounded-full grid place-items-center text-5xl shadow-inner"
              style={{ backgroundColor: kidColor(selectedKid) + "2e" }}>
              {selectedKid.avatar}
            </span>
            <p className="mt-3 font-bold text-lg">Hola, {selectedKid.name}</p>
            <p className="text-sm text-muted-foreground">Escribe tu PIN</p>
            {formError ? <p className="mt-2 text-sm text-rose-600">{formError}</p> : null}
            <div className="flex gap-2.5 mt-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className="h-3.5 w-3.5 rounded-full transition-colors"
                  style={{ backgroundColor: i < pin.length ? kidColor(selectedKid) : "#e2e8f0" }} />
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
                className="rounded-2xl text-white py-4 text-xl font-bold shadow-sm active:scale-95 disabled:opacity-40"
                style={{ backgroundColor: kidColor(selectedKid) }}>
                ✓
              </button>
            </div>
          </div>
        ) : null}

        {view === "parent" ? (
          <form onSubmit={submitParent} className="mt-10 space-y-3 bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-lg">Entrar como {boot.parent?.name || "adulto"}</h2>
            {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
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