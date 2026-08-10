import "server-only";

import { z } from "zod";

const databaseUrlSchema = z.url({
  protocol: /^postgres(ql)?:$/,
  hostname: z.regexes.domain,
});

export function getDatabaseUrl(): string {
  return databaseUrlSchema.parse(process.env.DATABASE_URL);
}
