import { describe, expect, it } from "vitest";

import { parseAssignmentSessionResults } from "./session-form";

const itemId = "11111111-1111-4111-8111-111111111111";

function formWithItem() {
  const form = new FormData();
  form.set("itemSnapshotIds", itemId);
  form.set(`result:${itemId}:completedAt`, new Date().toISOString());
  return form;
}

describe("session result resistance form", () => {
  it("parses fixed weight separately from the prescription", () => {
    const form = formWithItem();
    form.set(`result:${itemId}:resistanceType`, "fixed_weight");
    form.set(`result:${itemId}:resistanceValue`, "135");
    form.set(`result:${itemId}:resistanceUnit`, "lb");

    expect(parseAssignmentSessionResults(form)[0]?.resistance).toEqual({
      type: "fixed_weight",
      value: 135,
      unit: "lb",
    });
  });

  it.each([
    ["bodyweight", null],
    ["band", "Heavy band"],
    ["free_text", "Moderate sled"],
  ])("parses %s result resistance", (type, description) => {
    const form = formWithItem();
    form.set(`result:${itemId}:resistanceType`, type);
    if (description) {
      form.set(`result:${itemId}:resistanceDescription`, description);
    }

    expect(parseAssignmentSessionResults(form)[0]?.resistance).toEqual(
      description ? { type, description } : { type },
    );
  });

  it("keeps the explicit not-recorded state empty", () => {
    const form = formWithItem();
    form.set(`result:${itemId}:resistanceType`, "none");

    expect(parseAssignmentSessionResults(form)[0]?.resistance).toBeNull();
  });

  it("rejects unsupported result resistance types", () => {
    const form = formWithItem();
    form.set(`result:${itemId}:resistanceType`, "percent_1rm");

    expect(() => parseAssignmentSessionResults(form)).toThrow(
      "Choose a supported resistance type",
    );
  });
});
