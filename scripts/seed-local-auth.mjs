import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed local authentication");
}

const sql = neon(databaseUrl);

const organizationId = "10000000-0000-4000-8000-000000000001";
const teamId = "20000000-0000-4000-8000-000000000001";
const foreignOrganizationId = "10000000-0000-4000-8000-000000000099";
const foreignTeamId = "20000000-0000-4000-8000-000000000099";
const users = {
  owner: "30000000-0000-4000-8000-000000000001",
  manager: "30000000-0000-4000-8000-000000000002",
  athlete: "30000000-0000-4000-8000-000000000003",
  viewer: "30000000-0000-4000-8000-000000000004",
};

await sql.transaction([
  sql`
    INSERT INTO organizations (id, name, timezone)
    VALUES (${organizationId}, 'Local Training Organization', 'UTC')
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, timezone = EXCLUDED.timezone, updated_at = now()
  `,
  sql`
    INSERT INTO users (id, clerk_user_id, email, full_name)
    VALUES
      (${users.owner}, 'local:owner', 'owner@local.test', 'Local Owner'),
      (${users.manager}, 'local:manager', 'manager@local.test', 'Local Team Manager'),
      (${users.athlete}, 'local:athlete', 'athlete@local.test', 'Local Athlete'),
      (${users.viewer}, 'local:viewer', 'viewer@local.test', 'Local Viewer')
    ON CONFLICT (clerk_user_id) DO UPDATE
    SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, updated_at = now()
  `,
  sql`
    INSERT INTO organization_memberships (organization_id, user_id, role)
    VALUES
      (${organizationId}, ${users.owner}, 'owner'),
      (${organizationId}, ${users.manager}, 'athlete'),
      (${organizationId}, ${users.athlete}, 'athlete'),
      (${organizationId}, ${users.viewer}, 'viewer')
    ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, updated_at = now()
  `,
  sql`
    INSERT INTO teams (id, organization_id, name)
    VALUES (${teamId}, ${organizationId}, 'Basketball')
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, updated_at = now()
  `,
  sql`
    INSERT INTO team_memberships (organization_id, team_id, user_id, role)
    VALUES
      (${organizationId}, ${teamId}, ${users.manager}, 'manager'),
      (${organizationId}, ${teamId}, ${users.athlete}, 'athlete'),
      (${organizationId}, ${teamId}, ${users.viewer}, 'viewer')
    ON CONFLICT (team_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, updated_at = now()
  `,
  sql`
    INSERT INTO organizations (id, name, timezone)
    VALUES (${foreignOrganizationId}, 'Foreign Training Organization', 'UTC')
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, timezone = EXCLUDED.timezone, updated_at = now()
  `,
  sql`
    INSERT INTO teams (id, organization_id, name)
    VALUES (${foreignTeamId}, ${foreignOrganizationId}, 'Foreign Team')
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, updated_at = now()
  `,
]);

console.log("Seeded local auth personas for the Basketball team.");
