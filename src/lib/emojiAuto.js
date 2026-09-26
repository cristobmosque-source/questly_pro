// Detección automática de emoji para el título de una quest: normaliza el
// texto (minúsculas, sin acentos) y busca la primera categoría cuyas
// palabras clave aparezcan en el título. El orden importa: lo más específico
// va primero (p. ej. "baño" antes del genérico "limpiar").
const GROUPS = [
  { emoji: "🪥", words: ["diente", "cepill", "bucal"] },
  { emoji: "🚿", words: ["ducha", "ducharse", "banarse", "lavarse"] },
  { emoji: "🚽", words: ["bano", "inodoro", "wc", "sanitario", "servicio"] },
  { emoji: "🐕", words: ["pasear", "paseo", "paseador"] },
  { emoji: "🐶", words: ["perro", "perrito", "gato", "gatito", "mascota", "pez", "tortuga", "conejo", "pajar", "canario", "alimento", "comida al"] },
  { emoji: "🍽️", words: ["plato", "mesa", "traste", "fregar", "cocina de"] },
  { emoji: "🛏️", words: ["cama", "camita", "dormir", "acostar", "despertar", "alarma"] },
  { emoji: "🚗", words: ["auto", "automovil", "carro", "coche", "vehiculo", "movil", "moto", "bici", "bicicleta"] },
  { emoji: "👕", words: ["ropa", "doblar", "tender", "colgar", "lavar la ro", "camisa", "calcet"] },
  { emoji: "🗑️", words: ["basura", "botar", "contenedor", "desech", "recicl"] },
  { emoji: "🧸", words: ["juguete", "jugueteria"] },
  { emoji: "📚", words: ["tarea", "deber", "colegio", "escuela", "estudi", "matematic", "clase", "examen", "prueba", "leccion", "cuadern", "escolar"] },
  { emoji: "📖", words: ["leer", "lectura", "libro", "novela", "cuento"] },
  { emoji: "🌱", words: ["planta", "regar", "jardin", "huerta", "maceta"] },
  { emoji: "🍳", words: ["cocin", "comida", "almuerzo", "desayuno", "cena", "preparar", "receta"] },
  { emoji: "🧹", words: ["limpiar", "ordenar", "pieza", "habitacion", "cuarto", "escoba", "barrer", "asear", "arreglar", "casa", "estanter", "estante"] },
  { emoji: "👟", words: ["zapato", "zapatilla", "calzado"] },
  { emoji: "🛒", words: ["compra", "supermercado", "mercado", "mandado"] },
  { emoji: "🧼", words: ["jabon", "manos", "manito", "lavamanos"] },
  { emoji: "🎮", words: ["videojuego", "juego", "consola", "nintendo", "playstation", "pantalla"] },
  { emoji: "🎨", words: ["dibuj", "pintar", "arte", "colorear", "manualidad"] },
  { emoji: "⚽", words: ["futbol", "deporte", "cancha", "gol", "tenis", "gimnasio", "ejercicio"] },
  { emoji: "🎸", words: ["musica", "guitarra", "piano", "bateria", "canto", "cantar", "instrumento"] },
  { emoji: "🧽", words: ["ventana", "vidrio", "cristal", "espejo", "piso", "suelo"] },
  { emoji: "🛁", words: ["banera", "tina"] },
  { emoji: "💻", words: ["computadora", "compu", "laptop", "teclado", "programar"] },
  { emoji: "📱", words: ["telefono", "llamar", "celular", "videollamada"] },
  { emoji: "❤️", words: ["abuel", "visitar", "carta", "saludar", "gracias"] },
  { emoji: "🙏", words: ["orar", "rezar", "iglesia", "misa", "biblia"] },
];

export const EMOJI_FALLBACK = "⭐";

// Emojis ofrecidos en el selector manual.
export const EMOJI_CHOICES = [
  "⭐", "🛏️", "🧹", "🍽️", "🗑️", "🪥", "🚿", "🚽",
  "🚗", "👕", "🧸", "📚", "📖", "🌱", "🍳", "👟",
  "🐶", "🐱", "🛒", "🧼", "🎮", "🎨", "⚽", "🎸",
  "🧽", "💻", "📱", "❤️", "🙏", "💰", "🎁", "📝",
];

const normalize = (text) =>
  (text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Devuelve el emoji sugerido para un título; ⭐ si no hay coincidencia clara.
export function suggestEmoji(title) {
  const t = normalize(title);
  if (!t.trim()) return EMOJI_FALLBACK;
  for (const g of GROUPS) {
    if (g.words.some((w) => t.includes(w))) return g.emoji;
  }
  return EMOJI_FALLBACK;
}