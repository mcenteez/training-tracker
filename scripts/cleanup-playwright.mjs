import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;
const organizationId = "10000000-0000-4000-8000-000000000001";

export default async function cleanupPlaywrightData() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Playwright cleanup");
  }

  const sql = neon(databaseUrl);

  await sql.transaction([
    sql`
      DELETE FROM assignments
      WHERE organization_id = ${organizationId}
        AND source_plan_id IN (
          SELECT id
          FROM plans
          WHERE organization_id = ${organizationId}
            AND name LIKE 'Playwright %'
        )
    `,
    sql`
      DELETE FROM assignments
      WHERE organization_id = ${organizationId}
        AND source_workout_id IN (
          SELECT id
          FROM workouts
          WHERE organization_id = ${organizationId}
            AND name LIKE 'Playwright %'
        )
    `,
    sql`
      DELETE FROM plans
      WHERE organization_id = ${organizationId}
        AND name LIKE 'Playwright %'
    `,
    sql`
      DELETE FROM workouts
      WHERE organization_id = ${organizationId}
        AND name LIKE 'Playwright %'
    `,
    sql`
      DELETE FROM exercises
      WHERE organization_id = ${organizationId}
        AND name LIKE 'Playwright %'
    `,
  ]);
}
