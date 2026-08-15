import { describe, expect, it } from "vitest";

import {
  athletePrescriptionFormData,
  athletePrescriptionOverrideFormSchema,
} from "./athlete-prescription-input";

function baseForm() {
  const form = new FormData();
  form.set("assignmentId", "11111111-1111-4111-8111-111111111111");
  form.set("recipientId", "22222222-2222-4222-8222-222222222222");
  form.set("athleteUserId", "33333333-3333-4333-8333-333333333333");
  form.set("itemSnapshotId", "44444444-4444-4444-8444-444444444444");
  form.set("overriddenFields", "resistance");
  return form;
}

describe("athlete prescription resistance input", () => {
  it("parses a fixed-weight resistance as one union value", () => {
    const form = baseForm();
    form.set("resistanceType", "fixed_weight");
    form.set("resistanceValue", "135");
    form.set("resistanceUnit", "lb");

    const parsed = athletePrescriptionOverrideFormSchema.parse(
      athletePrescriptionFormData(form),
    );

    expect(parsed.resistance).toEqual({
      type: "fixed_weight",
      value: 135,
      unit: "lb",
    });
  });

  it("rejects an invalid structured resistance payload", () => {
    const form = baseForm();
    form.set("resistanceType", "percent_1rm");
    form.set("resistancePercentage", "250");

    expect(
      athletePrescriptionOverrideFormSchema.safeParse(
        athletePrescriptionFormData(form),
      ).success,
    ).toBe(false);
  });
});
