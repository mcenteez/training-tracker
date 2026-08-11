import { describe, expect, it } from "vitest";

import { resolveLibraryAccess } from "./library-access";

describe("library access resolver", () => {
  it.each(["owner", "manager"] as const)(
    "grants %s organization members management access",
    (organizationRole) => {
      expect(resolveLibraryAccess({ organizationRole, teamRoles: [] })).toBe(
        "manage",
      );
    },
  );

  it("grants organization viewers read access", () => {
    expect(
      resolveLibraryAccess({ organizationRole: "viewer", teamRoles: [] }),
    ).toBe("read");
  });

  it("grants Team Managers management access from an athlete organization role", () => {
    expect(
      resolveLibraryAccess({
        organizationRole: "athlete",
        teamRoles: ["athlete", "viewer", "manager"],
      }),
    ).toBe("manage");
  });

  it("grants Team Viewers read access from an athlete organization role", () => {
    expect(
      resolveLibraryAccess({
        organizationRole: "athlete",
        teamRoles: ["athlete", "viewer"],
      }),
    ).toBe("read");
  });

  it("denies athlete-only users access to the template library", () => {
    expect(
      resolveLibraryAccess({
        organizationRole: "athlete",
        teamRoles: ["athlete"],
      }),
    ).toBe("none");
  });
});
