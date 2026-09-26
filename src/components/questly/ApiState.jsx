import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Loading({ label = "Cargando…" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
      <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

// Muestra el error de una llamada, con opción de reintentar.
export function ErrorView({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="max-w-md mx-auto my-10 p-6 rounded-2xl bg-white border border-rose-200 shadow-sm text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-rose-500" />
      <p className="mt-3 font-medium text-rose-700">{error.message}</p>
      <Button className="mt-4" onClick={() => onRetry && onRetry()}>
        <RefreshCw className="mr-2 h-4 w-4" /> Reintentar
      </Button>
    </div>
  );
}