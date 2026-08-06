import { AdvancedSection } from "@/components/ui/advanced-section";
import { BotIcon,Loader2,NetworkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AgentsPageViewModel } from "./page.agents-page.view";
import { AGENT_TEMPLATES,Agent,slugifyAgentName } from "./page.icon-size-class";
export function AgentsPageSection1({ model }: { model: AgentsPageViewModel }) {
  const { applyTemplate, canAdminCurate, canCreateAgent, creating, form, handleCreate, setForm, setShowCreateDialog, showCreateDialog, t, tCommon, tList } = model;
  return (
    <Dialog open={canCreateAgent && showCreateDialog} onOpenChange={setShowCreateDialog}>
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-md overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{tList("guideDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>{tList("kindLabel")}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    kind: "assistant" as const,
                    icon: BotIcon,
                    title: tList("kindAssistant"),
                    description: tList("kindAssistantDescription"),
                  },
                  {
                    kind: "orchestrator" as const,
                    icon: NetworkIcon,
                    title: tList("kindOrchestrator"),
                    description: tList("kindOrchestratorDescription"),
                  },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const selected = form.kind === option.kind;
                return (
                  <button
                    key={option.kind}
                    type="button"
                    aria-pressed={selected}
                    className={cn("flex min-h-24 items-start gap-3 rounded-xl border p-3 text-left transition-[background-color,border-color,box-shadow] hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50", selected && "border-primary/50 bg-primary/5 shadow-sm")}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        kind: option.kind,
                        sharingMode: option.kind === "orchestrator" ? "personal" : current.sharingMode,
                      }))
                    }
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{option.title}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{tList("templateLabel")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {AGENT_TEMPLATES.map((template) => (
                <button key={template.id} type="button" className={cn("rounded-xl border p-3 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50", form.templateId === template.id && "border-primary/50 bg-primary/5")} disabled={form.kind === "orchestrator"} onClick={() => applyTemplate(template)}>
                  <span className="block font-medium">{tList(template.nameKey)}</span>
                  <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{tList(template.descriptionKey)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-name">{t("name")}</Label>
            <Input
              id="agent-name"
              name="agent-name"
              autoComplete="off"
              placeholder={t("namePlaceholder")}
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                  slug: slugifyAgentName(e.target.value),
                })
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-description">{t("descriptionLabel")}</Label>
            <Textarea
              id="agent-description"
              name="agent-description"
              placeholder={t("descriptionPlaceholder")}
              value={form.description}
              onChange={(e) =>
                setForm({
                  ...form,
                  description: e.target.value,
                })
              }
            />
          </div>
          <AdvancedSection label={tCommon("advanced")} hint={t("advancedHint")} storageKey="advanced:agent-create">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="agent-slug">{tList("slug")}</Label>
                <Input
                  id="agent-slug"
                  name="agent-slug"
                  autoComplete="off"
                  placeholder={tList("slugPlaceholder")}
                  value={form.slug}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      slug: e.target.value,
                    })
                  }
                />
              </div>
              {form.kind === "assistant" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="agent-sharing">{tList("access")}</Label>
                  <Select
                    value={form.sharingMode}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        sharingMode: value as Agent["sharingMode"],
                      })
                    }
                  >
                    <SelectTrigger id="agent-sharing" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">{t("configurePage.sharingPersonal")}</SelectItem>
                      <SelectItem value="marketplace">{t("configurePage.sharingWorkspace")}</SelectItem>
                      <SelectItem value="specific_user">{t("configurePage.sharingUser")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="rounded-xl border border-info/25 bg-info/5 p-3 text-xs leading-relaxed text-muted-foreground">{tList("orchestratorMarketplaceHint")}</p>
              )}
              {form.sharingMode === "specific_user" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="agent-share-email">{tList("userEmail")}</Label>
                  <Input id="agent-share-email" name="agent-share-email" type="email" autoComplete="email" spellCheck={false} value={form.shareTargetEmail} onChange={(e) => setForm({ ...form, shareTargetEmail: e.target.value })} />
                </div>
              ) : null}
              {canAdminCurate ? (
                <div className="rounded-xl border border-border/70 p-3">
                  <div className="flex flex-col gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Checkbox id="agent-global" checked={form.isGlobal} onCheckedChange={(checked) => setForm({ ...form, isGlobal: checked === true })} />
                      <label htmlFor="agent-global">{tList("global")}</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="agent-recommended"
                        checked={form.isRecommended}
                        onCheckedChange={(checked) =>
                          setForm({
                            ...form,
                            isRecommended: checked === true,
                          })
                        }
                      />
                      <label htmlFor="agent-recommended">{t("configurePage.recommended")}</label>
                    </div>
                    <Select value={form.curationLabel} onValueChange={(value) => setForm({ ...form, curationLabel: value })}>
                      <SelectTrigger className="w-full" aria-label={tList("curationLabel")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tList("curationNone")}</SelectItem>
                        <SelectItem value="recommended">{tList("badgeRecommended")}</SelectItem>
                        <SelectItem value="organization_created">{tList("curationOrgCreated")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
            </div>
          </AdvancedSection>
          <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{tList("createNextTitle")}</p>
            <p className="mt-1 text-muted-foreground">{tList("createNextDescription")}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={creating || !form.name.trim() || !form.slug.trim() || (form.sharingMode === "specific_user" && !form.shareTargetEmail.trim())}>
            {creating ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {tList("creating")}
              </>
            ) : (
              tList("createAndConfigure")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
