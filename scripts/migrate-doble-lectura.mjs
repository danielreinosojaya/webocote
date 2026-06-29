import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL no definida.");
  process.exit(1);
}

const sql = neon(url);

const steps = [
  `ALTER TABLE registros ADD COLUMN IF NOT EXISTS momento VARCHAR(10)`,
  `UPDATE registros SET momento = 'fin' WHERE momento IS NULL`,
  `ALTER TABLE registros ALTER COLUMN momento SET DEFAULT 'fin'`,
  `ALTER TABLE registros ALTER COLUMN momento SET NOT NULL`,
  `ALTER TABLE registros DROP CONSTRAINT IF EXISTS registros_equipo_id_fecha_key`,
  `ALTER TABLE registros DROP CONSTRAINT IF EXISTS registros_equipo_fecha_momento_key`,
  `ALTER TABLE registros ADD CONSTRAINT registros_momento_check CHECK (momento IN ('inicio', 'fin'))`,
  `ALTER TABLE registros ADD CONSTRAINT registros_equipo_fecha_momento_key UNIQUE (equipo_id, fecha, momento)`,
];

for (const step of steps) {
  await sql.query(step);
}

console.log("Migracion doble lectura completada.");
