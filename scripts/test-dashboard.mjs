import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const sql = neon(url);

async function main() {
  console.log("1. testing sql.query...");
  try {
    await sql.query(`SELECT 1 AS ok`);
    console.log("   sql.query OK");
  } catch (e) {
    console.error("   sql.query FAILED:", e.message);
  }

  console.log("2. testing momento column...");
  try {
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'registros' AND column_name = 'momento'
    `;
    console.log("   momento exists:", cols.length > 0);
  } catch (e) {
    console.error("   FAILED:", e.message);
  }

  console.log("3. testing findPrimerDiaIncompleto query...");
  const hasta = "2026-06-29";
  try {
    const rows = await sql`
      WITH inicio AS (
        SELECT COALESCE(MIN(fecha), ${hasta}::date) AS desde FROM registros
      ),
      fechas AS (
        SELECT generate_series(
          (SELECT desde FROM inicio),
          ${hasta}::date,
          INTERVAL '1 day'
        )::date AS fecha
      ),
      incompletos AS (
        SELECT f.fecha
        FROM fechas f
        CROSS JOIN equipos e
        WHERE e.activo = TRUE
          AND (
            NOT EXISTS (
              SELECT 1 FROM registros r
              WHERE r.fecha = f.fecha AND r.equipo_id = e.id AND r.momento = 'inicio'
            )
            OR NOT EXISTS (
              SELECT 1 FROM registros r
              WHERE r.fecha = f.fecha AND r.equipo_id = e.id AND r.momento = 'fin'
            )
          )
        GROUP BY f.fecha
      )
      SELECT MIN(fecha)::text AS fecha FROM incompletos
    `;
    console.log("   result:", rows[0]);
  } catch (e) {
    console.error("   FAILED:", e.message);
  }

  console.log("4. testing DO block...");
  try {
    await sql.query(`
      DO $$ BEGIN
        ALTER TABLE registros ADD CONSTRAINT registros_momento_check_test
          CHECK (momento IN ('inicio', 'fin'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    console.log("   DO block OK");
  } catch (e) {
    console.error("   DO block FAILED:", e.message);
  }

  console.log("5. equipos activos:", await sql`SELECT COUNT(*)::int AS n FROM equipos WHERE activo = TRUE`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
