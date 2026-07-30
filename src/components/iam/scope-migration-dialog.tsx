"use client";

import { useMemo, useState } from "react";
import {
  ArrowRightIcon,
  CopyIcon,
  MoveRightIcon,
  SearchIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

type Scope = "project" | "organization";
type Mode = "move" | "clone";
type Destination = {
  workspaceId: string;
  workspaceName: string;
  organizationId: string;
  organizationName: string;
};
type Preview = {
  source: {
    workspaceName?: string;
    organizationName: string;
  };
  destination: Destination;
  items?: { id: string }[];
  members?: { moved: number };
  counts?: Record<string, number>;
  conflictResolutions?: Array<{
    resourceType: "project" | "team" | "role";
    resourceId: string;
    label: string;
    from: string;
    to: string;
  }>;
  blockers?: string[];
  warnings: string[];
  confirmationToken: string;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

export function ScopeMigrationDialog({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("access");
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("project");
  const [mode, setMode] = useState<Mode>("move");
  const [secretPolicy, setSecretPolicy] = useState<"keep" | "disable">(
    "disable",
  );
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);

  const filteredDestinations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return destinations;
    return destinations.filter((destination) =>
      [destination.organizationName, destination.workspaceName].some((value) =>
        value.toLocaleLowerCase().includes(normalized),
      ),
    );
  }, [destinations, query]);

  async function loadDestinations(nextScope: Scope = scope) {
    setPending(true);
    setPreview(null);
    setDestinationId("");
    try {
      const endpoint =
        nextScope === "project"
          ? "/api/workspace/iam/resources/transfer"
          : "/api/workspace/iam/organizations/transfer";
      const params = new URLSearchParams({ sourceWorkspaceId: workspaceId });
      const result = await fetchJson<{ destinations: Destination[] }>(
        `${endpoint}?${params}`,
      );
      setDestinations(result.destinations);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("scopeMigrationLoadFailed"),
      );
    } finally {
      setPending(false);
    }
  }

  function selectScope(nextScope: Scope) {
    setScope(nextScope);
    void loadDestinations(nextScope);
  }

  async function requestPreview() {
    const destination = destinations.find((item) =>
      scope === "project"
        ? item.workspaceId === destinationId
        : item.organizationId === destinationId,
    );
    if (!destination) return;
    setPending(true);
    setPreview(null);
    try {
      const endpoint =
        scope === "project"
          ? "/api/workspace/iam/resources/transfer"
          : "/api/workspace/iam/organizations/transfer";
      const body =
        scope === "project"
          ? {
              action: "preview",
              mode,
              sourceWorkspaceId: workspaceId,
              targetWorkspaceId: destination.workspaceId,
              resourceType: "workspace",
              resourceId: workspaceId,
              options: {
                includeDependencies: true,
                accessPolicy: "compatible",
                ownershipPolicy: "preserve",
                secretPolicy,
              },
            }
          : {
              action: "preview",
              mode,
              sourceWorkspaceId: workspaceId,
              targetOrganizationId: destination.organizationId,
              secretPolicy,
            };
      setPreview(
        await fetchJson<Preview>(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("scopeMigrationPreviewFailed"),
      );
    } finally {
      setPending(false);
    }
  }

  async function execute() {
    if (!preview) return;
    setPending(true);
    try {
      const endpoint =
        scope === "project"
          ? "/api/workspace/iam/resources/transfer"
          : "/api/workspace/iam/organizations/transfer";
      const body =
        scope === "project"
          ? {
              action: "execute",
              mode,
              sourceWorkspaceId: workspaceId,
              targetWorkspaceId: preview.destination.workspaceId,
              resourceType: "workspace",
              resourceId: workspaceId,
              options: {
                includeDependencies: true,
                accessPolicy: "compatible",
                ownershipPolicy: "preserve",
                secretPolicy,
              },
              confirmationToken: preview.confirmationToken,
            }
          : {
              action: "execute",
              mode,
              sourceWorkspaceId: workspaceId,
              targetOrganizationId: preview.destination.organizationId,
              secretPolicy,
              confirmationToken: preview.confirmationToken,
            };
      await fetchJson(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(t("scopeMigrationCompleted"));
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("scopeMigrationFailed"),
      );
      setPreview(null);
    } finally {
      setPending(false);
    }
  }

  const selectedDestination = destinations.find((destination) =>
    scope === "project"
      ? destination.workspaceId === destinationId
      : destination.organizationId === destinationId,
  );
  const summaryEntries = preview?.counts
    ? Object.entries(preview.counts).filter(([, count]) => count > 0)
    : [
        ["resources", preview?.items?.length ?? 0],
        ["members", preview?.members?.moved ?? 0],
      ].filter(([, count]) => Number(count) > 0);

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("scopeMigrationTitle")}</DialogTitle>
          <DialogDescription>
            {t("scopeMigrationDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="scope-migration-scope">
                {t("scopeMigrationScope")}
              </FieldLabel>
              <Select value={scope} onValueChange={selectScope}>
                <SelectTrigger id="scope-migration-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">{t("scopeProject")}</SelectItem>
                  <SelectItem value="organization">
                    {t("scopeOrganization")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="scope-migration-mode">
                {t("scopeMigrationMode")}
              </FieldLabel>
              <Select
                value={mode}
                onValueChange={(value: Mode) => {
                  setMode(value);
                  setPreview(null);
                }}
              >
                <SelectTrigger id="scope-migration-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="move">
                    {t("scopeMigrationMove")}
                  </SelectItem>
                  <SelectItem value="clone">
                    {t("scopeMigrationClone")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="scope-destination-search">
              {t("searchDestination")}
            </FieldLabel>
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="scope-destination-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder={t("searchDestinationPlaceholder")}
              />
            </div>
          </Field>

          <div
            className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-2"
            aria-label={t("destinationProject")}
          >
            {pending && destinations.length === 0 ? (
              <div className="flex min-h-20 items-center justify-center">
                <Spinner />
              </div>
            ) : filteredDestinations.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                {t("noDestinations")}
              </p>
            ) : (
              filteredDestinations.map((destination) => {
                const id =
                  scope === "project"
                    ? destination.workspaceId
                    : destination.organizationId;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setDestinationId(id);
                      setPreview(null);
                    }}
                    className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[selected=true]:border-primary data-[selected=true]:bg-primary/5"
                    data-selected={destinationId === id}
                  >
                    <span>
                      <span className="block text-sm font-medium">
                        {scope === "project"
                          ? destination.workspaceName
                          : destination.organizationName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {scope === "project"
                          ? destination.organizationName
                          : destination.workspaceName}
                      </span>
                    </span>
                    {destinationId === id ? (
                      <Badge>{t("selected")}</Badge>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          {mode === "clone" ? (
            <Field>
              <FieldLabel htmlFor="scope-migration-secrets">
                {t("cloneSecrets")}
              </FieldLabel>
              <Select
                value={secretPolicy}
                onValueChange={(value: "keep" | "disable") => {
                  setSecretPolicy(value);
                  setPreview(null);
                }}
              >
                <SelectTrigger id="scope-migration-secrets" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disable">
                    {t("cloneWithoutSecrets")}
                  </SelectItem>
                  <SelectItem value="keep">{t("cloneWithSecrets")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {selectedDestination && !preview ? (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
              {mode === "clone" ? (
                <CopyIcon className="size-4" aria-hidden="true" />
              ) : (
                <MoveRightIcon className="size-4" aria-hidden="true" />
              )}
              <span>{t("scopeMigrationReadyToPreview")}</span>
              <ArrowRightIcon
                className="ml-auto size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          ) : null}

          {preview ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {summaryEntries.map(([label, count]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <div className="text-lg font-semibold">{count}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.has(`scopeCounts.${label}`)
                        ? t(`scopeCounts.${label}`)
                        : label}
                    </div>
                  </div>
                ))}
              </div>
              {(preview.blockers?.length ?? 0) > 0 ? (
                <Alert variant="destructive">
                  <AlertTitle>{t("transferBlocked")}</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {preview.blockers?.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
              {(preview.conflictResolutions?.length ?? 0) > 0 ? (
                <Alert>
                  <AlertTitle>{t("conflictsResolved")}</AlertTitle>
                  <AlertDescription className="grid gap-2">
                    <p>{t("conflictsResolvedDescription")}</p>
                    <ul className="grid gap-2">
                      {preview.conflictResolutions?.map((resolution) => (
                        <li
                          key={`${resolution.resourceType}:${resolution.resourceId}`}
                          className="grid gap-1 rounded-md border bg-background p-2"
                        >
                          <span className="text-xs text-muted-foreground">
                            {t(
                              `conflictResourceTypes.${resolution.resourceType}`,
                            )}{" "}
                            · {resolution.label}
                          </span>
                          <span className="flex flex-wrap items-center gap-2">
                            <code>{resolution.from}</code>
                            <ArrowRightIcon
                              className="size-3.5"
                              aria-hidden="true"
                            />
                            <code>{resolution.to}</code>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
              {preview.warnings.map((warning) => (
                <Alert key={warning}>
                  <AlertDescription>{warning}</AlertDescription>
                </Alert>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            {t("scopeMigrationCancel")}
          </Button>
          {!preview ? (
            <Button
              type="button"
              disabled={!selectedDestination || pending}
              onClick={() => void requestPreview()}
            >
              {pending ? <Spinner /> : null}
              {t("previewTransfer")}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={(preview.blockers?.length ?? 0) > 0 || pending}
              onClick={() => void execute()}
            >
              {pending ? <Spinner /> : null}
              {mode === "clone"
                ? t("confirmClone")
                : t("confirmScopeMigration")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
