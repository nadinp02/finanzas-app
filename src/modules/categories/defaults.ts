import type { CategoryColor } from "./palette";
import type { CategoryIconKey } from "./icons";

export interface DefaultCategory {
  name: string;
  icon: CategoryIconKey;
  color: CategoryColor;
  isFixedDefault?: boolean;
  children?: Omit<DefaultCategory, "children" | "color">[];
}

export const DEFAULT_EXPENSE_CATEGORIES: DefaultCategory[] = [
  {
    name: "Hogar",
    icon: "home",
    color: "stone",
    isFixedDefault: true,
    children: [
      { name: "Alquiler", icon: "key", isFixedDefault: true },
      { name: "Expensas", icon: "building", isFixedDefault: true },
      { name: "Servicios", icon: "zap", isFixedDefault: true },
      { name: "Internet y telefonía", icon: "wifi", isFixedDefault: true },
      { name: "Mantenimiento", icon: "wrench" },
    ],
  },
  { name: "Supermercado", icon: "cart", color: "sage" },
  {
    name: "Compras",
    icon: "bag",
    color: "plum",
    children: [
      { name: "Ropa", icon: "shirt" },
      { name: "Tecnología", icon: "smartphone" },
    ],
  },
  {
    name: "Salidas",
    icon: "utensils",
    color: "clay",
    children: [
      { name: "Restaurantes", icon: "utensils" },
      { name: "Delivery", icon: "pizza" },
      { name: "Bares y café", icon: "coffee" },
    ],
  },
  {
    name: "Salud",
    icon: "heart",
    color: "rose",
    children: [
      { name: "Farmacia", icon: "pill" },
      { name: "Médicos", icon: "stethoscope" },
      { name: "Prepaga", icon: "shield", isFixedDefault: true },
    ],
  },
  {
    name: "Transporte",
    icon: "car",
    color: "ocean",
    children: [
      { name: "Combustible", icon: "fuel" },
      { name: "Transporte público", icon: "bus" },
      { name: "Taxi y apps", icon: "taxi" },
      { name: "Estacionamiento y peajes", icon: "parking" },
    ],
  },
  { name: "Suscripciones", icon: "repeat", color: "indigo", isFixedDefault: true },
  {
    name: "Cuidado personal",
    icon: "sparkles",
    color: "amber",
    children: [
      { name: "Peluquería", icon: "scissors" },
      { name: "Gimnasio", icon: "dumbbell", isFixedDefault: true },
    ],
  },
  { name: "Educación", icon: "graduation", color: "teal" },
  { name: "Entretenimiento", icon: "film", color: "olive" },
  { name: "Regalos", icon: "gift", color: "rose" },
  { name: "Viajes", icon: "plane", color: "ocean" },
  { name: "Impuestos", icon: "landmark", color: "slate", isFixedDefault: true },
  { name: "Otros", icon: "more", color: "stone" },
];

export const DEFAULT_INCOME_CATEGORIES: DefaultCategory[] = [
  { name: "Sueldo", icon: "briefcase", color: "moss", isFixedDefault: true },
  { name: "Trabajo independiente", icon: "laptop", color: "teal" },
  { name: "Ventas", icon: "store", color: "amber" },
  { name: "Reintegros", icon: "undo", color: "sage" },
  { name: "Rendimientos", icon: "trending", color: "indigo" },
  { name: "Otros ingresos", icon: "coins", color: "stone" },
];

export interface DefaultMerchant {
  name: string;
  /** Ruta "Padre › Hija" o "Padre" de la categoría habitual. */
  category: string;
  aliases?: string[];
}

/** Comercios frecuentes en Argentina (con foco en Córdoba). Se pueden editar o borrar. */
export const DEFAULT_MERCHANTS: DefaultMerchant[] = [
  { name: "Farmacity", category: "Salud › Farmacia", aliases: ["farmaciti", "farma city"] },
  { name: "Coto", category: "Supermercado" },
  { name: "Carrefour", category: "Supermercado", aliases: ["carrefur"] },
  { name: "Supermercado Día", category: "Supermercado", aliases: ["super dia", "supermercado dia"] },
  { name: "Jumbo", category: "Supermercado" },
  { name: "Disco", category: "Supermercado" },
  { name: "Vea", category: "Supermercado" },
  { name: "ChangoMás", category: "Supermercado", aliases: ["chango mas", "changomas"] },
  { name: "Hipermercado Libertad", category: "Supermercado", aliases: ["libertad"] },
  { name: "Cordiez", category: "Supermercado" },
  { name: "Super Mami", category: "Supermercado", aliases: ["supermami"] },
  { name: "YPF", category: "Transporte › Combustible", aliases: ["i pe efe"] },
  { name: "Shell", category: "Transporte › Combustible" },
  { name: "Axion", category: "Transporte › Combustible", aliases: ["axión"] },
  { name: "Uber", category: "Transporte › Taxi y apps" },
  { name: "Cabify", category: "Transporte › Taxi y apps" },
  { name: "DiDi", category: "Transporte › Taxi y apps" },
  { name: "SUBE", category: "Transporte › Transporte público", aliases: ["la sube"] },
  { name: "Mercado Libre", category: "Compras", aliases: ["mercadolibre", "meli"] },
  { name: "Rappi", category: "Salidas › Delivery", aliases: ["rapi"] },
  { name: "PedidosYa", category: "Salidas › Delivery", aliases: ["pedidos ya"] },
  { name: "Netflix", category: "Suscripciones" },
  { name: "Spotify", category: "Suscripciones" },
  { name: "Disney+", category: "Suscripciones", aliases: ["disney plus", "disney"] },
  { name: "YouTube Premium", category: "Suscripciones", aliases: ["youtube"] },
  { name: "HBO Max", category: "Suscripciones", aliases: ["max"] },
  { name: "Personal", category: "Hogar › Internet y telefonía" },
  { name: "Movistar", category: "Hogar › Internet y telefonía" },
  { name: "Claro", category: "Hogar › Internet y telefonía" },
  { name: "EPEC", category: "Hogar › Servicios", aliases: ["epec luz"] },
  { name: "Ecogas", category: "Hogar › Servicios", aliases: ["eco gas"] },
  { name: "Aguas Cordobesas", category: "Hogar › Servicios" },
];
