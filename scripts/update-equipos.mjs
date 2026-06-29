import { neon } from "@neondatabase/serverless";

const SEED = [
  { nombre: "Refrigeradora proteina", tipo: "refrigeracion", temp_max: 4, orden: 0 },
  { nombre: "Refrigeradora mesa fria", tipo: "refrigeracion", temp_max: 4, orden: 1 },
  { nombre: "Refrigeradora postres y barra", tipo: "refrigeracion", temp_max: 4, orden: 2 },
  { nombre: "Refrigerador almacen proteinas", tipo: "refrigeracion", temp_max: 4, orden: 3 },
  { nombre: "Refrigeradora de barra", tipo: "refrigeracion", temp_max: 4, orden: 4 },
  { nombre: "Refrigeradora de copas barra", tipo: "refrigeracion", temp_max: 4, orden: 5 },
  { nombre: "Refrigerador vegetales", tipo: "vegetales", temp_max: 8, orden: 6 },
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL no definida.");
  process.exit(1);
}

const sql = neon(url);
const nombres = SEED.map((e) => e.nombre);

await sql`
  UPDATE equipos
  SET activo = FALSE
  WHERE activo = TRUE
    AND NOT (nombre = ANY(${nombres}))
`;

for (const equipo of SEED) {
  await sql`
    INSERT INTO equipos (nombre, tipo, temp_max, orden, activo)
    VALUES (${equipo.nombre}, ${equipo.tipo}, ${equipo.temp_max}, ${equipo.orden}, TRUE)
    ON CONFLICT (nombre) DO UPDATE SET
      tipo = EXCLUDED.tipo,
      temp_max = EXCLUDED.temp_max,
      orden = EXCLUDED.orden,
      activo = TRUE
  `;
}

const activos = await sql`
  SELECT nombre, tipo, orden FROM equipos WHERE activo = TRUE ORDER BY orden ASC
`;
console.log(`Equipos activos (${activos.length}):`);
for (const e of activos) {
  console.log(`  - ${e.nombre} (${e.tipo})`);
}
