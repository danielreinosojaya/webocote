import { neon } from "@neondatabase/serverless";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS equipos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('refrigeracion', 'congelacion', 'vegetales')),
    temp_max NUMERIC(4,1) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    orden SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS registros (
    id SERIAL PRIMARY KEY,
    equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    momento VARCHAR(10) NOT NULL DEFAULT 'fin' CHECK (momento IN ('inicio', 'fin')),
    hora TIME NOT NULL,
    temperatura NUMERIC(4,1) NOT NULL,
    responsable VARCHAR(20) NOT NULL,
    incidencias TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (equipo_id, fecha, momento)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_registros_fecha ON registros (fecha)`,
  `CREATE INDEX IF NOT EXISTS idx_registros_equipo_fecha ON registros (equipo_id, fecha)`,
];

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
  console.error("DATABASE_URL no definida. Exporta la variable y vuelve a ejecutar.");
  process.exit(1);
}

const sql = neon(url);

for (const statement of STATEMENTS) {
  await sql.query(statement);
}

for (const equipo of SEED) {
  await sql`
    INSERT INTO equipos (nombre, tipo, temp_max, orden)
    VALUES (${equipo.nombre}, ${equipo.tipo}, ${equipo.temp_max}, ${equipo.orden})
    ON CONFLICT (nombre) DO NOTHING
  `;
}

const count = await sql`SELECT COUNT(*)::int AS n FROM equipos WHERE activo = TRUE`;
console.log(`Migracion completada. Equipos activos: ${count[0].n}`);
