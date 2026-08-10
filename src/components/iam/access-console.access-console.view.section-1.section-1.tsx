import { Card } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import type { AccessConsoleViewModel } from "./access-console.access-console.view";
import { AccessRolesSection1 } from "./access-console.access-console.view.section-1.section-1.section-1";
import { AccessRolesSection2 } from "./access-console.access-console.view.section-1.section-1.section-2";

export function AccessMainSection1({
  model,
}: {
  model: AccessConsoleViewModel;
}) {
  const {} = model;
  return (
    <TabsContent value="roles">
      <Card>
        <AccessRolesSection2 model={model} />
        <AccessRolesSection1 model={model} />
      </Card>
    </TabsContent>
  );
}
