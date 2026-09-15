"use client";
import type { useGenesysHandoff } from "./use-genesys-handoff";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
export function GenesysHandoffBanner({
  handoff,
  sending,
  summary,
}: {
  handoff: ReturnType<typeof useGenesysHandoff>;
  sending: boolean;
  summary: string;
}) {
  const { state, t, pending, error, mutate } = handoff;
  if (!state?.available && !state?.session)
    return error ? (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    ) : null;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 py-2">
      <Alert>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <div role="status">
            <p>
              {state.session
                ? t(`states.${state.session.state}`)
                : t("requestHint")}
            </p>
            {state.session?.deliveryPending ? (
              <p>
                {t("deliveryPending", { count: state.session.deliveryPending })}
              </p>
            ) : null}
            {state.session?.deliveryFailed ? (
              <p>{t("deliveryFailed")}</p>
            ) : null}
            {state.session?.errorCode ? <p>{t("serviceError")}</p> : null}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={pending || sending || state.session?.state === "closing"}
            onClick={() =>
              void mutate(
                state.session
                  ? { action: "resume" }
                  : {
                      action: "request",
                      reason: t("manualReason"),
                      summary: summary.slice(-3000) || t("manualReason"),
                    },
              )
            }
          >
            {t(state.session ? "resume" : "request")}
          </Button>
        </AlertDescription>
      </Alert>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
