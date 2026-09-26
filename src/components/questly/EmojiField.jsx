import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EMOJI_CHOICES } from "@/lib/emojiAuto";
import { cn } from "@/lib/utils";

// Muestra el emoji de la quest (automático 🤖 o elegido a mano) y permite
// cambiarlo con un toque. "Cambiar emoji" fija la elección manual: a partir de
// ahí, editar el título ya no lo reemplaza; "Automático" vuelve al modo auto.
export default function EmojiField({ emoji, mode, onPick, onAuto }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title={mode === "auto" ? "Emoji automático — tócalo para cambiarlo" : "Cambiar emoji"}
          className="h-9 w-full rounded-md border border-input bg-transparent text-lg grid place-items-center shadow-sm hover:bg-accent">
          {emoji || "⭐"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <p className="text-xs font-semibold text-muted-foreground mb-2">
          {mode === "auto" ? "🤖 Asignado automáticamente" : "Elegido por ti"}
        </p>
        <div className="grid grid-cols-8 gap-1.5">
          {EMOJI_CHOICES.map((e) => (
            <button key={e} type="button" onClick={() => onPick(e)}
              className={cn("h-8 w-8 rounded-lg text-lg grid place-items-center hover:bg-accent",
                emoji === e && "bg-violet-100 ring-1 ring-violet-400")}>
              {e}
            </button>
          ))}
        </div>
        <button type="button"
          onClick={onAuto}
          className="mt-2 w-full text-xs font-semibold text-violet-600 hover:underline">
          🤖 Automático según el título
        </button>
      </PopoverContent>
    </Popover>
  );
}