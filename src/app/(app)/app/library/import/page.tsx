import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loadLibraryAppContext } from "@/lib/library-context";
import {
  buildLibraryImportPrompt,
  libraryImportExampleJson,
} from "@/modules/library-import/application/example-bundle";
import { libraryImportSchemaPath } from "@/modules/library-import/application/format";

import { CopyButton } from "./copy-button";
import { LibraryImportForm } from "./import-form";

export default async function LibraryImportPage() {
  const context = await loadLibraryAppContext();

  if (context.libraryAccess !== "manage") {
    redirect("/app/library/workouts?error=forbidden_import");
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const schemaUrl = `${protocol}://${host}${libraryImportSchemaPath}`;
  const prompt = buildLibraryImportPrompt(schemaUrl);

  return (
    <div className="space-y-8 py-7">
      <div>
        <h2 className="text-2xl font-semibold">Import</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Bring exercises, workouts, and plans in from a JSON file. Nothing is
          saved until you review what will be created.
        </p>
      </div>

      <details className="border border-border">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          Format and AI prompt
        </summary>
        <div className="space-y-6 border-t border-border px-4 py-5">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Generate with an AI tool</h3>
            <p className="text-sm text-muted-foreground">
              Copy this prompt, add a description of the program you want, and
              paste the result below.
            </p>
            <CopyButton label="Copy prompt" value={prompt} />
            <pre className="max-h-72 overflow-auto border border-border bg-muted/40 p-4 text-xs whitespace-pre-wrap">
              {prompt}
            </pre>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Schema</h3>
            <p className="text-sm text-muted-foreground">
              The machine-readable contract lives at{" "}
              <a
                href={libraryImportSchemaPath}
                className="underline underline-offset-4"
              >
                {schemaUrl}
              </a>
              .
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Example</h3>
            <CopyButton label="Copy example" value={libraryImportExampleJson} />
            <pre className="max-h-96 overflow-auto border border-border bg-muted/40 p-4 text-xs">
              {libraryImportExampleJson}
            </pre>
          </div>
        </div>
      </details>

      <LibraryImportForm />
    </div>
  );
}
