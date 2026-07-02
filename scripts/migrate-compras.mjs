import { neon } from "@neondatabase/serverless";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS proveedores (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    cif VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (nombre)
  )`,
  `CREATE TABLE IF NOT EXISTS insumos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL UNIQUE,
    unidad VARCHAR(30) NOT NULL DEFAULT 'ud',
    categoria VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS mapeo_descripciones (
    id SERIAL PRIMARY KEY,
    texto_original VARCHAR(500) NOT NULL,
    proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
    insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (texto_original, proveedor_id)
  )`,
  `CREATE TABLE IF NOT EXISTS albaranes (
    id SERIAL PRIMARY KEY,
    proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
    proveedor_nombre VARCHAR(200) NOT NULL,
    fecha DATE NOT NULL,
    numero VARCHAR(100),
    estado VARCHAR(20) NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'confirmado')),
    notas TEXT,
    metodo_extraccion VARCHAR(20),
    periodo CHAR(7) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS lineas_compra (
    id SERIAL PRIMARY KEY,
    albaran_id INTEGER NOT NULL REFERENCES albaranes(id) ON DELETE CASCADE,
    insumo_id INTEGER REFERENCES insumos(id) ON DELETE SET NULL,
    descripcion_original VARCHAR(500) NOT NULL,
    cantidad NUMERIC(12,3) NOT NULL,
    unidad VARCHAR(30) NOT NULL DEFAULT 'ud',
    precio_unitario NUMERIC(12,4),
    total NUMERIC(12,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_albaranes_fecha ON albaranes (fecha)`,
  `CREATE INDEX IF NOT EXISTS idx_albaranes_periodo ON albaranes (periodo)`,
  `CREATE INDEX IF NOT EXISTS idx_lineas_albaran ON lineas_compra (albaran_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lineas_insumo ON lineas_compra (insumo_id)`,
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

const counts = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM proveedores) AS proveedores,
    (SELECT COUNT(*)::int FROM insumos) AS insumos,
    (SELECT COUNT(*)::int FROM albaranes) AS albaranes
`;
console.log(`Migracion compras completada.`, counts[0]);
