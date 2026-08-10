import { DestructiveConfirmationDialog } from "@/components/destructive-confirmation-dialog";
import type { useScheduledTaskManagerController } from "./scheduled-task-manager.scheduled-task-manager";
import { ScheduledTaskManagerSection1 } from "./scheduled-task-manager.scheduled-task-manager.view.section-1";
import { ScheduledTaskManagerSection2 } from "./scheduled-task-manager.scheduled-task-manager.view.section-2";

export type ScheduledTaskManagerViewModel = Extract<
  ReturnType<typeof useScheduledTaskManagerController>,
  { kind: "ready" }
>;
export function ScheduledTaskManagerView({
  model,
}: {
  model: ScheduledTaskManagerViewModel;
}) {
  const {
    deleteTask,
    deletingTaskId,
    pendingDeleteTask,
    setPendingDeleteTask,
    t,
  } = model;
  return (
    <>
      <ScheduledTaskManagerSection2 model={model} />

      <ScheduledTaskManagerSection1 model={model} />
      <DestructiveConfirmationDialog
        open={pendingDeleteTask !== null}
        title={t("deleteTitle")}
        description={t("deleteDescription", {
          title: pendingDeleteTask?.title ?? "",
        })}
        cancelLabel={t("deleteCancel")}
        confirmLabel={deletingTaskId ? t("deleting") : t("deleteConfirm")}
        busy={deletingTaskId !== null}
        onOpenChange={(open) => {
          if (!open && !deletingTaskId) setPendingDeleteTask(null);
        }}
        onConfirm={() => {
          if (pendingDeleteTask) void deleteTask(pendingDeleteTask);
        }}
      />
    </>
  );
}
