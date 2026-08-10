import { resolve } from "node:path";
import { config } from "dotenv";

export function loadDatabaseEnv(): void {
  config({ path: resolve(process.cwd(), ".env.local") });
  config({ path: resolve(process.cwd(), ".env") });
}
