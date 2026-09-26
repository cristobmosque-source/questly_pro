import { useCallback, useEffect, useState } from "react";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { ErrorView, Loading } from "@/components/questly/ApiState";
import ConfirmDialog from "@/components/questly/ConfirmDialog";
import { api, clearSession, fmtMoney, fmtPoints, getSessionUser, notifyPointsChanged } from "@/lib/questlyApi";

// Perfil del niño: sus datos y la gestión de su PIN secreto (crearlo si no
// tiene, o pedir un restablecimiento al adulto si lo olvidó).
export default function KidProfile() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const user = getSessionUser();
  const color = user?.color || "#7c4dff";
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [askForgot, setAskForgot] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api("/kid/profile"));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createPin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api("/kid/pin", { method: "POST", body: { pin, confirm } });
      toast({ title: "🔐 " + res.message });
      setPin("");
      setConfirm("");
      await load();
    } catch (err) {
      toast({ title: "Ups", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const forgotPin = async () => {
    setAskForgot(false);
    setBusy(true);
    try {
      const res = await api("/kid/pin/forgot", { method: "POST" });
      toast({ title: "📨 " + res.message });
      await load();
    } catch (err) {
      toast({ title: "Ups", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorView error={error} onRetry={load} />;
  if (!data) return <Loading label="Cargando tu perfil…" />;

  const { kid, pin_request } = data;
  const validPin = /^\d{4,6}$/.test(pin) && pin === confirm;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl text-white p-5 shadow-md flex items-center gap-4"
        style={{ background: `linear-gradient(120deg, ${color} 0%, ${color}cc 60%, #f59e0bcc 130%)` }}>
        <span className="h-16 w-16 rounded-full grid place-items-center text-4xl bg-white/20">{kid.avatar}</span>
        <div>
          <h1 className="text-2xl font-extrabold">{kid.name}</h1>
          <p className="text-sm opacity-90">⭐ {fmtPoints(kid.points)} puntos · 💰 {fmtMoney(kid.points)}</p>
        </div>
      </div>

      <section className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5">
        <h2 className="font-bold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-violet-600" /> Mi PIN secreto
        </h2>

        {kid.has_pin ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-muted-foreground">
              🔒 Tienes un PIN configurado. Por seguridad no se muestra; lo usas para entrar.
            </p>
            {pin_request?.status === "pending" ? (
              <p className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                ⏳ Pediste restablecer tu PIN. Un adulto lo revisará pronto.
              </p>
            ) : (
              <>
                {pin_request?.status === "rejected" ? (
                  <p className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
                    Tu última solicitud fue rechazada. Puedes pedirla otra vez si la necesitas.
                  </p>
                ) : null}
                <Button variant="outline" className="font-bold" disabled={busy} onClick={() => setAskForgot(true)}>
                  Olvidé mi PIN
                </Button>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={createPin} className="mt-3 space-y-3">
            <p className="text-sm text-muted-foreground">
              Crea tu propio PIN para que nadie más entre con tu perfil. No se mostrará después de guardarlo.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="kp-pin">PIN (4-6 dígitos)</Label>
                <Input id="kp-pin" type="password" inputMode="numeric" maxLength={6} required
                  value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kp-confirm">Confirmar PIN</Label>
                <Input id="kp-confirm" type="password" inputMode="numeric" maxLength={6} required
                  value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} />
              </div>
            </div>
            <Button type="submit" className="w-full font-bold" disabled={busy || !validPin}>
              <KeyRound className="h-4 w-4 mr-1" /> Crear mi PIN
            </Button>
          </form>
        )}
      </section>

      <Button
        variant="outline"
        className="w-full font-bold text-slate-500"
        onClick={() => { clearSession(); notifyPointsChanged(); navigate("/"); }}
      >
        <LogOut className="h-4 w-4 mr-1" /> Salir de mi perfil
      </Button>

      <ConfirmDialog
        open={askForgot}
        title="¿Olvidaste tu PIN?"
        description="Enviaremos una solicitud para que un adulto restablezca tu PIN. No puedes cambiarlo solo."
        confirmLabel="Sí, enviar solicitud"
        loading={busy}
        onConfirm={forgotPin}
        onCancel={() => setAskForgot(false)}
      />
    </div>
  );
}