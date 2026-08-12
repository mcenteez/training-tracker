import {
  capDiagnostics,
  diagnosticsFromZodError,
  type ImportDiagnostic,
} from "./diagnostics";
import {
  libraryImportBundleSchema,
  type LibraryImportBundle,
} from "./bundle-input";
import { libraryImportFormatVersion, libraryImportLimits } from "./format";

export type ParseBundleResult =
  | { ok: true; bundle: LibraryImportBundle }
  | { ok: false; diagnostics: ImportDiagnostic[] };

function bundleError(code: string, message: string): ParseBundleResult {
  return {
    ok: false,
    diagnostics: [
      {
        severity: "error",
        entity: "bundle",
        location: "(root)",
        code,
        message,
      },
    ],
  };
}

export function parseLibraryImportBundle(source: string): ParseBundleResult {
  const text = source.replace(/^\uFEFF/, "").trim();

  if (!text) {
    return bundleError("empty_source", "Provide a JSON file or paste JSON.");
  }

  if (
    new TextEncoder().encode(text).byteLength > libraryImportLimits.fileBytes
  ) {
    return bundleError(
      "too_large",
      `Imports are limited to ${Math.floor(libraryImportLimits.fileBytes / 1024)} KB.`,
    );
  }

  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch {
    return bundleError(
      "invalid_json",
      "This is not valid JSON. Check for trailing commas, unquoted keys, or truncated output.",
    );
  }

  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return bundleError(
      "invalid_root",
      "The top level of the file must be a JSON object.",
    );
  }

  const declaredVersion = (json as { formatVersion?: unknown }).formatVersion;

  if (
    typeof declaredVersion === "number" &&
    declaredVersion !== libraryImportFormatVersion
  ) {
    return bundleError(
      "unsupported_format_version",
      `Format version ${declaredVersion} is not supported. This app expects version ${libraryImportFormatVersion}.`,
    );
  }

  const parsed = libraryImportBundleSchema.safeParse(json);

  if (!parsed.success) {
    return {
      ok: false,
      diagnostics: capDiagnostics(diagnosticsFromZodError(parsed.error)),
    };
  }

  return { ok: true, bundle: parsed.data };
}
