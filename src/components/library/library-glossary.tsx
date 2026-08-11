import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const glossaryItems = [
  {
    term: "Exercise",
    definition:
      "A reusable movement definition with coaching cues, category, equipment, and optional video.",
    usage:
      "Create exercises first so coaches can consistently reuse the same movement across many workouts.",
  },
  {
    term: "Workout",
    definition:
      "A single session template that defines what an athlete should complete in one training session.",
    usage:
      "Use workouts as reusable templates for common session days such as Push, Pull, or Legs.",
  },
  {
    term: "Training block",
    definition:
      "An ordered grouping inside one workout, such as straight sets, circuits, or supersets.",
    usage:
      "Break a workout into logical blocks like warm-up, primary strength, accessories, and finisher.",
  },
  {
    term: "Plan",
    definition:
      "A multi-session schedule that organizes several workout templates across a weekly cycle.",
    usage:
      "Use plans to arrange session templates over time, for example a weekly Push/Pull/Legs cadence.",
  },
  {
    term: "Assignment",
    definition:
      "A future execution object that delivers a plan or workout to athletes with historical snapshotting.",
    usage:
      "Use assignments when publishing training to athletes so in-progress history is stable even if templates later change.",
  },
];

export function LibraryGlossary() {
  return (
    <Card className="rounded-md border-dashed">
      <CardHeader>
        <CardTitle>Library terms and usage</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3 text-sm">
          {glossaryItems.map((item) => (
            <div key={item.term} className="space-y-1">
              <dt className="font-medium">{item.term}</dt>
              <dd className="text-muted-foreground">{item.definition}</dd>
              <dd className="text-muted-foreground">
                Use it when: {item.usage}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
