import type { AlbaranExtraido, LineaExtraida } from "./compras.js";

const SYSTEM_PROMPT = `Eres un asistente que extrae datos de albaranes de compra de restaurantes en España.
Analiza el documento y devuelve SOLO JSON valido con esta estructura exacta:
{
  "proveedor": "nombre del proveedor o emisor",
  "fecha": "YYYY-MM-DD o null si no se encuentra",
  "numero": "numero de albaran o null",
  "lineas": [
    {
      "descripcion": "descripcion del producto",
      "cantidad": 0,
      "unidad": "kg|caja|ud|l|pack|bolsa|etc",
      "precio_unitario": 0.00,
      "total": 0.00
    }
  ],
  "confianza": "alta|media|baja",
  "notas": "observaciones sobre datos dudosos o null"
}

Reglas:
- Extrae TODAS las lineas de producto, no resumas ni agrupes.
- Ignora totales, IVA, bases imponibles y lineas de portes si no son producto.
- Cantidades y precios como numeros, no strings.
- Si un precio no aparece, usa null.
- Fecha en formato ISO YYYY-MM-DD.
- Unidades en minusculas y abreviadas (kg, ud, caja, l, pack).
- Si el documento es ilegible, devuelve lineas vacias y confianza "baja".`;

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY no configurada");
  }
  return key;
}

function parseExtraction(raw: string): AlbaranExtraido {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const data = JSON.parse(cleaned) as Record<string, unknown>;

  const lineas: LineaExtraida[] = Array.isArray(data.lineas)
    ? data.lineas.map((l: Record<string, unknown>) => ({
        descripcion: String(l.descripcion ?? "").trim(),
        cantidad: Number(l.cantidad) || 0,
        unidad: String(l.unidad ?? "ud").trim().toLowerCase(),
        precio_unitario: l.precio_unitario != null ? Number(l.precio_unitario) : null,
        total: l.total != null ? Number(l.total) : null,
      }))
    : [];

  const confianza = ["alta", "media", "baja"].includes(String(data.confianza))
    ? (data.confianza as "alta" | "media" | "baja")
    : "media";

  return {
    proveedor: String(data.proveedor ?? "").trim() || "Proveedor desconocido",
    fecha: data.fecha ? String(data.fecha).slice(0, 10) : null,
    numero: data.numero ? String(data.numero).trim() : null,
    lineas: lineas.filter((l) => l.descripcion && l.cantidad > 0),
    confianza,
    metodo: "texto",
    notas: data.notas ? String(data.notas) : null,
  };
}

async function callOpenAI(
  messages: Array<{ role: string; content: unknown }>,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("OpenAI error:", err);
    throw new Error("Error al procesar el albaran con IA");
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? "{}";
}

export async function extractFromText(text: string): Promise<AlbaranExtraido> {
  const content = await callOpenAI([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Extrae los datos de este albaran de compra:\n\n${text.slice(0, 12000)}`,
    },
  ]);

  const result = parseExtraction(content);
  result.metodo = "texto";
  return result;
}

export async function extractFromImages(
  images: string[],
): Promise<AlbaranExtraido> {
  const imageContent = images.slice(0, 6).map((base64) => ({
    type: "image_url" as const,
    image_url: {
      url: base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`,
      detail: "high" as const,
    },
  }));

  const content = await callOpenAI([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Este albaran es un documento escaneado o una foto convertida a PDF. Lee todas las paginas y extrae las lineas de compra.",
        },
        ...imageContent,
      ],
    },
  ]);

  const result = parseExtraction(content);
  result.metodo = "vision";
  return result;
}
