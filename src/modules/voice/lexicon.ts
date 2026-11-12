/**
 * Vocabulario rioplatense para interpretar y validar lo dictado. Todo en minúsculas y sin acentos
 * (se compara contra texto plegado con `fold`).
 */
import type { AccountType } from "@/generated/prisma/enums";

/** Frases de ingreso. Se buscan antes que las de gasto: "me cobraron" es gasto, "cobré" es ingreso. */
export const EXPENSE_PHRASES = [
  "me cobraron", "me cobro", "me debitaron", "me descontaron", "gaste", "gastamos", "gasto de", "pague", "pagamos", "compre",
  "compramos", "cargue", "abone", "me salio", "salio", "costo", "me gaste", "invite", "puse", "di",
];
export const INCOME_PHRASES = [
  "cobre", "cobramos", "me pagaron", "me pago", "me ingreso", "me ingresaron", "ingreso", "ingresaron",
  "me depositaron", "me transfirieron", "me entro", "me entraron", "recibi", "vendi", "me devolvieron",
  "me reintegraron", "reintegro", "sueldo", "aguinaldo", "honorarios", "cobro", "me acreditaron", "acreditaron",
];

/**
 * Palabras clave → nombres de categoría (de la más específica a la más general). Se usan cuando no
 * hay comercio conocido: "nafta" → Combustible. Solo se aplican si la categoría existe.
 */
export const CATEGORY_KEYWORDS: { kind: "EXPENSE" | "INCOME"; words: string[]; categories: string[] }[] = [
  { kind: "EXPENSE", words: ["nafta", "combustible", "gasoil", "gnc", "cargue nafta"], categories: ["Combustible", "Transporte"] },
  { kind: "EXPENSE", words: ["supermercado", "super", "almacen", "verduleria", "carniceria", "chino", "mercaderia", "compras del mes"], categories: ["Supermercado"] },
  { kind: "EXPENSE", words: ["farmacia", "remedios", "remedio", "medicamentos", "medicamento"], categories: ["Farmacia", "Salud"] },
  { kind: "EXPENSE", words: ["medico", "consulta", "dentista", "odontologo", "analisis", "estudios medicos", "psicologo", "kinesiologo"], categories: ["Médicos", "Salud"] },
  { kind: "EXPENSE", words: ["prepaga", "obra social"], categories: ["Prepaga", "Salud"] },
  { kind: "EXPENSE", words: ["alquiler"], categories: ["Alquiler", "Hogar"] },
  { kind: "EXPENSE", words: ["expensas"], categories: ["Expensas", "Hogar"] },
  { kind: "EXPENSE", words: ["luz", "gas", "agua", "servicios", "factura de luz", "factura de gas"], categories: ["Servicios", "Hogar"] },
  { kind: "EXPENSE", words: ["internet", "celular", "telefono", "wifi", "abono del celular"], categories: ["Internet y telefonía", "Hogar"] },
  { kind: "EXPENSE", words: ["plomero", "electricista", "arreglo", "ferreteria", "pintura"], categories: ["Mantenimiento", "Hogar"] },
  { kind: "EXPENSE", words: ["uber", "taxi", "remis", "cabify", "didi"], categories: ["Taxi y apps", "Transporte"] },
  { kind: "EXPENSE", words: ["colectivo", "bondi", "sube", "subte", "tren", "pasaje de colectivo"], categories: ["Transporte público", "Transporte"] },
  { kind: "EXPENSE", words: ["estacionamiento", "peaje", "cochera", "parking"], categories: ["Estacionamiento y peajes", "Transporte"] },
  { kind: "EXPENSE", words: ["restaurante", "restaurant", "almuerzo", "cena", "parrilla", "comimos afuera", "comida afuera"], categories: ["Restaurantes", "Salidas"] },
  { kind: "EXPENSE", words: ["delivery", "pedido", "pizza", "empanadas", "hamburguesas", "sushi"], categories: ["Delivery", "Salidas"] },
  { kind: "EXPENSE", words: ["cafe", "cafecito", "bar", "cerveza", "birra", "tragos", "merienda", "desayuno"], categories: ["Bares y café", "Salidas"] },
  { kind: "EXPENSE", words: ["ropa", "zapatillas", "remera", "pantalon", "campera", "zapatos", "vestido"], categories: ["Ropa", "Compras"] },
  { kind: "EXPENSE", words: ["auriculares", "cargador", "computadora", "notebook", "celular nuevo", "tecnologia"], categories: ["Tecnología", "Compras"] },
  { kind: "EXPENSE", words: ["peluqueria", "corte de pelo", "barberia", "manicura", "unas"], categories: ["Peluquería", "Cuidado personal"] },
  { kind: "EXPENSE", words: ["gimnasio", "gym", "cuota del gimnasio"], categories: ["Gimnasio", "Cuidado personal"] },
  { kind: "EXPENSE", words: ["suscripcion", "netflix", "spotify", "disney", "youtube"], categories: ["Suscripciones"] },
  { kind: "EXPENSE", words: ["curso", "facultad", "colegio", "escuela", "libros", "libro", "universidad", "cuota del colegio"], categories: ["Educación"] },
  { kind: "EXPENSE", words: ["cine", "teatro", "recital", "entradas", "show", "juego"], categories: ["Entretenimiento"] },
  { kind: "EXPENSE", words: ["regalo", "cumpleanos"], categories: ["Regalos"] },
  { kind: "EXPENSE", words: ["viaje", "pasajes", "hotel", "vuelo", "hostel"], categories: ["Viajes"] },
  { kind: "EXPENSE", words: ["impuesto", "impuestos", "afip", "arca", "monotributo", "rentas", "patente", "abl", "inmobiliario"], categories: ["Impuestos"] },
  { kind: "INCOME", words: ["sueldo", "salario", "aguinaldo", "recibo de sueldo"], categories: ["Sueldo"] },
  { kind: "INCOME", words: ["honorarios", "freelance", "factura", "cliente", "trabajo", "changa", "proyecto"], categories: ["Trabajo independiente"] },
  { kind: "INCOME", words: ["vendi", "venta", "ventas"], categories: ["Ventas"] },
  { kind: "INCOME", words: ["reintegro", "devolucion", "me devolvieron", "me reintegraron"], categories: ["Reintegros"] },
  { kind: "INCOME", words: ["plazo fijo", "intereses", "rendimiento", "rendimientos", "dividendos"], categories: ["Rendimientos"] },
];

/** Menciones genéricas de medio de pago → tipos de cuenta posibles. */
export const PAYMENT_PHRASES: { phrases: string[]; types: AccountType[] }[] = [
  { phrases: ["en efectivo", "efectivo", "en billetes", "cash", "plata en mano"], types: ["CASH"] },
  { phrases: ["tarjeta de credito", "con credito", "con la tarjeta", "con tarjeta", "la tarjeta", "en cuotas"], types: ["CREDIT_CARD"] },
  { phrases: ["tarjeta de debito", "con debito", "debito", "debitado"], types: ["BANK", "SAVINGS"] },
  { phrases: ["mercado pago", "mercadopago", "billetera", "con qr", "el qr"], types: ["DIGITAL_WALLET"] },
  { phrases: ["por transferencia", "transferencia", "transferi", "del banco", "en el banco", "al banco", "cuenta bancaria", "caja de ahorro"], types: ["BANK", "SAVINGS"] },
];

/** Palabras genéricas que no identifican por sí solas una cuenta ("Banco Galicia" se reconoce por "galicia"). */
export const GENERIC_ACCOUNT_WORDS = new Set([
  "banco", "cuenta", "caja", "ahorro", "ahorros", "tarjeta", "credito", "debito", "de", "del", "la", "el", "en", "mi",
  "pesos", "dolares", "usd", "ars", "sueldo", "plata", "billetera", "virtual", "y", "pago", "pagos", "mercado", "efectivo",
]);

/**
 * Comercios cuyo nombre es una palabra común ("Claro", "Personal", "Disco"): solo cuentan si van
 * precedidos de una preposición o verbo de compra ("en Disco", "pagué Claro").
 */
export const COMMON_WORD_MERCHANTS = new Set(["claro", "personal", "disco", "vea", "max", "libertad", "dia", "shell"]);
export const MERCHANT_CUES = ["en", "a", "al", "de", "del", "pague", "compre", "gaste en", "con"];

/** Movimientos que la voz no registra (pagos de tarjeta, transferencias entre cuentas propias). */
export const UNSUPPORTED_PHRASES = [
  "pague la tarjeta", "pague el resumen", "pago de la tarjeta", "pago del resumen", "pague la visa", "pague la master",
  "transferi a mi", "pase plata", "movi plata",
];

/** Montos dichos para algo que no es un movimiento ("me queda", "tengo", "presupuesto"). */
export const NON_MOVEMENT_CUES = ["me quedan", "me queda", "tengo", "saldo", "presupuesto", "limite"];
