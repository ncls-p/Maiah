import { Button } from "@/components/ui/button";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
export function AccessPeopleBranch1({ model }: { model: AccessConsoleViewModel }) {
  const { people, setVisiblePeopleCount, t, visiblePeople } = model;
  return (
    <div className="flex justify-center px-6">
      <Button type="button" variant="outline" onClick={() => setVisiblePeopleCount((count) => count + 25)}>
        {t("showMore", {
          count: Math.min(25, people.length - visiblePeople.length),
        })}
      </Button>
    </div>
  );
}
