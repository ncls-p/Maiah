"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  EyeIcon,
  SendIcon,
  Share2,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  ResourceShareDialog,
  type ShareableResource,
} from "@/components/marketplace/resource-share-dialog";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchWorkspacePermissions } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type BuilderMessage = {
  role: "user" | "assistant";
  content: string;
};

type SecretField = {
  name: string;
  label: string;
  type: "secret" | "text" | "url" | "email" | "password";
  required: boolean;
  description?: string;
};

type SecretRequest = {
  id: string;
  title: string;
  description: string | null;
  fields: SecretField[];
  expiresAt: string;
};

type WorkflowPreview = {
  title: string;
  summary: string;
  steps: Array<{ label: string; description: string; kind?: string }>;
  inputs?: string[];
  outputs?: string[];
  status: "draft" | "needs_secrets" | "ready" | "created";
};

type ProgressEvent = {
  label: string;
  status: "done" | "pending";
};

type RegisteredTool = {
  id: string;
  name: string;
  status: string;
  isGlobal?: boolean;
  canEdit?: boolean;
};

type CustomTool = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  isGlobal: boolean;
  canEdit: boolean;
  n8nWorkflowId: string | null;
  metadataJson?: { workflowPreview?: WorkflowPreview } | null;
  createdAt: string;
};

function userSafeText(value: string, automationEngine: string) {
  return value.replace(/n8n/gi, automationEngine);
}

export function CustomToolBuilder() {
  const t = useTranslations("customTools.builder");
  const tShare = useTranslations("marketplace.share");
  const { workspaceId } = useWorkspace();
  const [shareResource, setShareResource] = useState<ShareableResource | null>(
    null,
  );
  const [messages, setMessages] = useState<BuilderMessage[]>(() => [
    { role: "assistant", content: t("welcome") },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [secretRequest, setSecretRequest] = useState<SecretRequest | null>(
    null,
  );
  const [pendingSecretRequest, setPendingSecretRequest] =
    useState<SecretRequest | null>(null);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [credentialRefs, setCredentialRefs] = useState<
    Array<{ requestId: string; credentialRef: string }>
  >([]);
  const [registeredTools, setRegisteredTools] = useState<RegisteredTool[]>([]);
  const [workflowPreview, setWorkflowPreview] =
    useState<WorkflowPreview | null>(null);
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [actionCount, setActionCount] = useState(0);
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [canManageTenantGlobals, setCanManageTenantGlobals] = useState(false);
  const [createGlobal, setCreateGlobal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const lastSecretRequestId = secretRequest?.id;
  const canSend = Boolean(workspaceId && input.trim() && !busy);
  const examples = [
    t("examples.slack"),
    t("examples.api"),
    t("examples.sheets"),
  ];

  const loadTools = useCallback(async () => {
    if (!workspaceId) return;
    setLoadingTools(true);
    try {
      const permissions = await fetchWorkspacePermissions(workspaceId);
      setCanManageTenantGlobals(permissions.canManageTenantGlobals);
      const res = await fetch(
        `/api/workspace/custom-tools?workspaceId=${workspaceId}`,
      );
      if (!res.ok) return;
      setCustomTools((await res.json()) as CustomTool[]);
    } finally {
      setLoadingTools(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadTools(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadTools]);

  async function runBuilder(
    nextMessages: BuilderMessage[],
    nextCredentialRefs = credentialRefs,
  ) {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workspace/custom-tools/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          messages: nextMessages,
          credentialRefs: nextCredentialRefs,
          isGlobal: canManageTenantGlobals ? createGlobal : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errors.builderFailed"));
      if (data.message) {
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: userSafeText(data.message, t("automationEngine")),
          },
        ]);
      }
      if (data.workflowPreviews?.length) {
        setWorkflowPreview(data.workflowPreviews.at(-1) as WorkflowPreview);
      }
      if (typeof data.actionCount === "number") {
        setActionCount(data.actionCount);
      }
      if (data.progressEvents?.length) {
        setProgressEvents(data.progressEvents as ProgressEvent[]);
      }
      if (data.secretRequests?.length) {
        setPendingSecretRequest(data.secretRequests[0]);
        setSecretValues({});
      }
      if (data.registeredTools?.length) {
        setRegisteredTools((current) => [...data.registeredTools, ...current]);
        await loadTools();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("errors.runFailed");
      toast.error(message);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: t("errors.message", { message }) },
      ]);
      return;
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(content = input) {
    if (!workspaceId || !content.trim()) return;
    const nextMessages = [
      ...messages,
      { role: "user" as const, content: content.trim() },
    ];
    setMessages(nextMessages);
    setInput("");
    await runBuilder(nextMessages);
  }

  function previewForTool(tool: {
    name: string;
    description?: string | null;
    status: string;
    metadataJson?: { workflowPreview?: WorkflowPreview } | null;
  }) {
    return (
      tool.metadataJson?.workflowPreview ?? {
        title: tool.name,
        summary: tool.description || t("preview.savedSummary"),
        status: tool.status === "workflow_created" ? "created" : "draft",
        steps: [
          {
            label: t("preview.inputLabel"),
            description: t("preview.inputDescription"),
          },
          {
            label: t("preview.actionLabel"),
            description: t("preview.actionDescription"),
          },
          {
            label: t("preview.resultLabel"),
            description: t("preview.resultDescription"),
          },
        ],
      }
    );
  }

  async function removeCustomTool(toolId: string) {
    if (!workspaceId) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/workspace/custom-tools/${toolId}?workspaceId=${workspaceId}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("errors.deleteFailed"));
      setRegisteredTools((current) =>
        current.filter((tool) => tool.id !== toolId),
      );
      setCustomTools((current) => current.filter((tool) => tool.id !== toolId));
      toast.success(
        data.workflowDeleteError
          ? t("delete.remoteWarning")
          : t("delete.success"),
      );
      setPendingDelete(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("errors.deleteFailed"),
      );
      return;
    } finally {
      setDeleting(false);
    }
  }

  async function submitSecrets() {
    if (!workspaceId || !secretRequest) return;
    try {
      const res = await fetch(
        `/api/workspace/custom-tools/secrets/${secretRequest.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            values: secretValues,
            provider: secretRequest.title,
            label: secretRequest.title,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errors.secretsFailed"));
      const ref = {
        requestId: secretRequest.id,
        credentialRef: data.credentialRef as string,
      };
      const nextCredentialRefs = [...credentialRefs, ref];
      const visibleMessages: BuilderMessage[] = [
        ...messages,
        {
          role: "assistant",
          content: t("secrets.connectionReceived"),
        },
      ];
      const builderMessages: BuilderMessage[] = [
        ...visibleMessages,
        {
          role: "user",
          content: t("secrets.continuePrompt"),
        },
      ];
      setCredentialRefs(nextCredentialRefs);
      setMessages(visibleMessages);
      setSecretRequest(null);
      setPendingSecretRequest(null);
      setSecretValues({});
      toast.success(t("secrets.stored"));
      await runBuilder(builderMessages, nextCredentialRefs);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("errors.secretsFailed"),
      );
      return;
    }
  }

  const statusSummary = useMemo(() => {
    const total = customTools.length + registeredTools.length;
    return t("toolsCount", { count: total });
  }, [customTools.length, registeredTools.length, t]);

  function displayToolStatus(status: string) {
    if (status === "workflow_created") return t("toolStatus.ready");
    if (status === "draft") return t("toolStatus.draft");
    return status;
  }
  const displayedTools: Array<{
    id: string;
    name: string;
    status: string;
    description?: string | null;
    isGlobal?: boolean;
    canEdit?: boolean;
    metadataJson?: { workflowPreview?: WorkflowPreview } | null;
  }> = Array.from(
    new Map(
      [...registeredTools, ...customTools].map((tool) => [tool.id, tool]),
    ).values(),
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="min-h-[680px]">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle asChild>
              <h2 className="flex items-center gap-2">
                <WorkflowIcon
                  className="size-5 text-muted-foreground"
                  aria-hidden="true"
                />
                {t("title")}
              </h2>
            </CardTitle>
            <Badge variant="secondary">{t("protectedSecrets")}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex h-[560px] flex-col gap-4">
          <div className="flex-1 overflow-y-auto rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-col gap-4">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={cn(
                    "max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                    message.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-background text-foreground border border-border/70",
                  )}
                >
                  {message.content}
                </div>
              ))}
              {pendingSecretRequest ? (
                <div className="rounded-2xl border bg-card p-3">
                  <p className="text-sm font-medium">
                    {t("connectionRequired")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pendingSecretRequest.fields
                      .map((field) => field.label)
                      .join(", ")}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3"
                    onClick={() => setSecretRequest(pendingSecretRequest)}
                  >
                    {t("openSecureDialog")}
                  </Button>
                </div>
              ) : null}
              {busy ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground">
                  <Spinner /> {t("building")}
                </div>
              ) : null}
              {progressEvents.length > 0 ? (
                <div className="space-y-1 rounded-2xl border border-border/70 bg-background p-3 text-xs text-muted-foreground">
                  {progressEvents.map((event, index) => (
                    <div
                      key={`${event.label}-${index}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span>{event.label}</span>
                      <span>{event.status === "done" ? "✓" : "…"}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {!busy && actionCount > 0 ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground">
                  {t("actionsCompleted", { count: actionCount })}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {examples.map((example) => (
                <Button
                  key={example}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setInput(example)}
                >
                  {example.slice(0, 54)}…
                </Button>
              ))}
            </div>
            {canManageTenantGlobals ? (
              <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                <Checkbox
                  id="custom-tool-global"
                  checked={createGlobal}
                  onCheckedChange={(checked) =>
                    setCreateGlobal(checked === true)
                  }
                />
                <div className="grid gap-1.5 leading-none">
                  <Label htmlFor="custom-tool-global">
                    {t("tenantVisibility")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("tenantVisibilityDescription")}
                  </p>
                </div>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Textarea
                aria-label={t("promptAria")}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={t("promptPlaceholder")}
                className="min-h-24"
              />
              <Button
                className="self-stretch"
                onClick={() => sendMessage()}
                disabled={!canSend}
              >
                {busy ? <Spinner /> : <SendIcon />}
                <span className="sr-only">{t("send")}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-5">
        <Card className="overflow-visible">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle asChild>
                <h2 className="flex items-center gap-2">
                  <WorkflowIcon className="size-5" aria-hidden="true" />
                  {t("diagram")}
                </h2>
              </CardTitle>
              <Badge variant="outline">
                {workflowPreview?.status === "created"
                  ? t("previewStatus.created")
                  : workflowPreview?.status === "ready"
                    ? t("previewStatus.ready")
                    : workflowPreview?.status === "needs_secrets"
                      ? t("previewStatus.needsSecrets")
                      : t("previewStatus.draft")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {workflowPreview ? (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="font-heading text-base font-semibold">
                    {workflowPreview.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {workflowPreview.summary}
                  </p>
                </div>
                <div className="relative overflow-hidden rounded-2xl border bg-muted/30 p-4">
                  <svg
                    className="pointer-events-none absolute inset-0 size-full opacity-40"
                    aria-hidden="true"
                  >
                    <defs>
                      <pattern
                        id="schema-grid"
                        width="24"
                        height="24"
                        patternUnits="userSpaceOnUse"
                      >
                        <path
                          d="M 24 0 L 0 0 0 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="0.5"
                        />
                      </pattern>
                    </defs>
                    <rect
                      width="100%"
                      height="100%"
                      fill="url(#schema-grid)"
                      className="text-border"
                    />
                  </svg>
                  <div className="relative flex flex-col gap-3">
                    {workflowPreview.steps.map((step, index) => (
                      <div
                        key={`${step.label}-${index}`}
                        className="flex items-center gap-2"
                      >
                        <div className="min-w-0 flex-1 rounded-2xl border bg-background p-3">
                          <div className="flex items-center gap-2">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                              {index + 1}
                            </span>
                            <p className="truncate text-sm font-medium">
                              {step.label}
                            </p>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {step.description}
                          </p>
                        </div>
                        {index < workflowPreview.steps.length - 1 ? (
                          <ArrowRightIcon className="size-4 shrink-0 text-primary" />
                        ) : (
                          <CheckCircle2Icon className="size-4 shrink-0 text-primary" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                {t("emptyDiagram")}
              </div>
            )}
          </CardContent>
        </Card>

        {displayedTools.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle asChild className="text-base">
                <h2>{t("createdTools")}</h2>
              </CardTitle>
              <CardDescription>
                {loadingTools ? t("loading") : statusSummary}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {displayedTools.slice(0, 5).map((tool) => (
                <div
                  key={tool.id}
                  className="rounded-xl border border-border/70 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{tool.name}</p>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={tool.isGlobal ? "secondary" : "outline"}>
                        {tool.isGlobal ? t("tenant") : t("private")}
                      </Badge>
                      <Badge variant="outline">
                        {displayToolStatus(tool.status)}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWorkflowPreview(previewForTool(tool))}
                    >
                      <EyeIcon className="size-3" aria-hidden="true" />
                      {t("view")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={tool.canEdit === false}
                      onClick={() =>
                        setShareResource({
                          kind: "custom_tool",
                          id: tool.id,
                          name: tool.name,
                          description: tool.description ?? null,
                        })
                      }
                    >
                      <Share2 className="size-3" aria-hidden="true" />
                      {tShare("action")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={tool.canEdit === false}
                      onClick={() =>
                        setPendingDelete({ id: tool.id, name: tool.name })
                      }
                    >
                      <Trash2Icon className="size-3" aria-hidden="true" />
                      {t("delete.action")}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog
        open={Boolean(secretRequest)}
        onOpenChange={(open) => !open && setSecretRequest(null)}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {secretRequest?.title ?? t("secrets.title")}
            </DialogTitle>
            <DialogDescription>
              {secretRequest?.description ?? t("secrets.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {secretRequest?.fields.map((field) => (
              <div
                key={`${lastSecretRequestId}-${field.name}`}
                className="space-y-2"
              >
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required ? " *" : ""}
                </Label>
                <Input
                  id={field.name}
                  type={
                    field.type === "secret" || field.type === "password"
                      ? "password"
                      : field.type
                  }
                  value={secretValues[field.name] ?? ""}
                  onChange={(event) =>
                    setSecretValues((current) => ({
                      ...current,
                      [field.name]: event.target.value,
                    }))
                  }
                  required={field.required}
                />
                {field.description ? (
                  <p className="text-xs text-muted-foreground">
                    {field.description}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSecretRequest(null)}>
              {t("secrets.cancel")}
            </Button>
            <Button onClick={submitSecrets}>{t("secrets.store")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("delete.description", { name: pendingDelete?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("delete.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting || !pendingDelete}
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) void removeCustomTool(pendingDelete.id);
              }}
            >
              {deleting ? t("delete.deleting") : t("delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResourceShareDialog
        resource={shareResource}
        workspaceId={workspaceId}
        open={shareResource !== null}
        onCloseAction={() => setShareResource(null)}
      />
    </div>
  );
}
