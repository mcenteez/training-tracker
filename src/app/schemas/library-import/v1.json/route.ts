import { NextResponse } from "next/server";

import { buildLibraryImportJsonSchema } from "@/modules/library-import/application/json-schema";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  return NextResponse.json(buildLibraryImportJsonSchema(origin), {
    headers: {
      "Content-Type": "application/schema+json",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
