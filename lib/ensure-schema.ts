import { neon } from "@neondatabase/serverless";
import { getSql } from "./db";

type Sql = ReturnType<typeof neon>;

let ready: Promise<void> | null = null;

const STEPS = [
  `ALTER TABLE registros ADD COLUMN IF NOT EXISTS momento VARCHAR(10)`,
  `UPDATE registros SET momento = 'fin' WHERE momento IS NULL`,
  `ALTER TABLE registros ALTER COLUMN momento SET DEFAULT 'fin'`,
  `ALTER TABLE registros DROP CONSTRAINT IF EXISTS registros_equipo_id_fecha_key`,
  `ALTER TABLE registros DROP CONSTRAINT IF EXISTS registros_equipo_fecha_momento_key`,
];

async function run(sql: Sql): Promise<void> {
  for (const step of STEPS) {
    await sql.query(step);
  }

  await sql.query(`
    UPDATE registros SET momento = 'fin' WHERE momento IS NULL OR momento NOT IN ('inicio', 'fin')
  `);

  try {
    await sql.query(`ALTER TABLE registros ALTER COLUMN momento SET NOT NULL`);
  } catch {
    /* ya aplicado */
  }

  await sql.query(`
    DO $$ BEGIN
      ALTER TABLE registros ADD CONSTRAINT registros_momento_check
        CHECK (momento IN ('inicio', 'fin'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await sql.query(`
    DO $$ BEGIN
      ALTER TABLE registros ADD CONSTRAINT registros_equipo_fecha_momento_key
        UNIQUE (equipo_id, fecha, momento);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
}

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = run(getSql()).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}
