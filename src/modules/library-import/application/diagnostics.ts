import type { z } from "zod";

import { libraryImportLimits } from "./format";

export const importDiagnosticSeverities = ["error", "warning"] as const;

export type ImportDiagnosticSeverity =
  (typeof importDiagnosticSeverities)[number];

export type ImportEntity = "exercise" | "workout" | "plan" | "bundle";

export interface ImportDiagnostic {
  severity: ImportDiagnosticSeverity;
  entity: ImportEntity;
  location: string;
  code: string;
  message: string;
}

export function formatJsonPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((accumulator, segment) => {
    if (typeof segment === "number") {
      return `${accumulator}[${segment}]`;
    }

    return accumulator ? `${accumulator}.${String(segment)}` : String(segment);
  }, "");
}

const entityByRootSegment: Record<string, ImportEntity> = {
  exercises: "exercise",
  workouts: "workout",
  plans: "plan",
};

export function entityFromPath(path: readonly PropertyKey[]): ImportEntity {
  const [root] = path;
  return (typeof root === "string" && entityByRootSegment[root]) || "bundle";
}

export function diagnosticsFromZodError(error: z.ZodError): ImportDiagnostic[] {
  return error.issues.map((issue) => ({
    severity: "error" as const,
    entity: entityFromPath(issue.path),
    location: formatJsonPath(issue.path) || "(root)",
    code: issue.code,
    message: issue.message,
  }));
}

export function hasBlockingError(
  diagnostics: readonly ImportDiagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function capDiagnostics(
  diagnostics: readonly ImportDiagnostic[],
): ImportDiagnostic[] {
  if (diagnostics.length <= libraryImportLimits.diagnostics) {
    return [...diagnostics];
  }

  const truncated = diagnostics.slice(0, libraryImportLimits.diagnostics - 1);
  const omitted = diagnostics.length - truncated.length;

  return [
    ...truncated,
    {
      severity: "error",
      entity: "bundle",
      location: "(root)",
      code: "too_many_diagnostics",
      message: `${omitted} further problems were not listed. Fix the problems above and try again.`,
    },
  ];
}
