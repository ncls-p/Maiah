import { MoveRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import type { useScopeMigrationDialogController } from "./scope-migration-dialog.scope-migration-dialog";
import { ScopeMigrationDialogSection1 } from "./scope-migration-dialog.scope-migration-dialog.view.section-1";

export type ScopeMigrationDialogViewModel = Extract<
  ReturnType<typeof useScopeMigrationDialogController>,
  { kind: "ready" }
>;
export function ScopeMigrationDialogView({
  model,
}: {
  model: ScopeMigrationDialogViewModel;
}) {
  const { loadDestinations, open, setOpen, setPreview, t } = model;
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) void loadDestinations();
        else setPreview(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <MoveRightIcon aria-hidden="true" />
          {t("scopeMigration")}
        </Button>
      </DialogTrigger>
      <ScopeMigrationDialogSection1 model={model} />
    </Dialog>
  );
}
