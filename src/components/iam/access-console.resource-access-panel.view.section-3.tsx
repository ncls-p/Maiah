import { Trash2Icon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import type { ResourceAccessPanelViewModel } from "./access-console.resource-access-panel.view";
export function ResourceAccessPanelSection3({
  model,
}: {
  model: ResourceAccessPanelViewModel;
}) {
  const {
    deleteResource,
    deletingResource,
    deletionPending,
    setDeletingResource,
    t,
  } = model;
  return (
    <AlertDialog
      open={Boolean(deletingResource)}
      onOpenChange={(open) => {
        if (!open && !deletionPending) setDeletingResource(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deletingResource
              ? t("deleteResourceTitle", { name: deletingResource.name })
              : t("deleteResourceFallbackTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteResourceDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletionPending}>
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deletionPending}
            onClick={(event) => {
              event.preventDefault();
              void deleteResource();
            }}
          >
            {deletionPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Trash2Icon data-icon="inline-start" aria-hidden="true" />
            )}
            {deletionPending
              ? t("deletingResource")
              : t("confirmDeleteResource")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
