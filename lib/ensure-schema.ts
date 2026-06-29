import { neon } from "@neondatabase/serverless";
import { getSql } from "./db";

type Sql = ReturnType<typeof neon>;

let ready: Promise<void> | null = null;

async function runStep(sql: Sql, statement: string): Promise<void> {
  await sql.query(statement);
}

async function run(sql: Sql): Promise<void> {
  await runStep(sql, `ALTER TABLE registros ADD COLUMN IF NOT EXISTS momento VARCHAR(10)`);
  await runStep(sql, `UPDATE registros SET momento = 'fin' WHERE momento IS NULL`);
  await runStep(sql, `ALTER TABLE registros ALTER COLUMN momento SET DEFAULT 'fin'`);
  await runStep(sql, `ALTER TABLE registros DROP CONSTRAINT IF EXISTS registros_equipo_id_fecha_key`);
  await runStep(sql, `ALTER TABLE registros DROP CONSTRAINT IF EXISTS registros_equipo_fecha_momento_key`);

  await runStep(
    sql,
    `UPDATE registros SET momento = 'fin' WHERE momento IS NULL OR momento NOT IN ('inicio', 'fin')`,
  );

  await runStep(sql, `ALTER TABLE registros ALTER COLUMN momento SET NOT NULL`);

  try {
    await runStep(
      sql,
      `ALTER TABLE registros ADD CONSTRAINT registros_momento_check CHECK (momento IN ('inicio', 'fin'))`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("already exists")) throw err;
  }

  try {
    await runStep(
      sql,
      `ALTER TABLE registros ADD CONSTRAINT registros_equipo_fecha_momento_key UNIQUE (equipo_id, fecha, momento)`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("already exists")) throw err;
  }
}

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = run(getSql()).catch((err) => {
      ready = null;
      console.error("ensureSchema failed:", err);
      throw err;
    });
  }
  return ready;
}
