import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookMarkedIcon, PencilIcon, PlusIcon, SearchIcon } from "lucide-react";
import { SKILLS_PAGE_SIZE } from "./skill-manager.button-type";
import type { SkillManagerViewModel } from "./skill-manager.skill-manager.view";
export function SkillManagerSection2({
  model,
}: {
  model: SkillManagerViewModel;
}) {
  const {
    filteredSkills,
    query,
    scopeFilter,
    setEditorState,
    setInstallOpen,
    setQuery,
    setScopeFilter,
    setSourceFilter,
    setVisibleCount,
    sourceFilter,
    t,
    visibleCount,
  } = model;
  return (
    <div className="rounded-2xl border border-border/65 bg-card/85 p-3 shadow-[var(--surface-shadow)]">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(SKILLS_PAGE_SIZE);
            }}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-10 pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select
            value={scopeFilter}
            onValueChange={(value) => {
              setScopeFilter(value as "all" | "organization" | "private");
              setVisibleCount(SKILLS_PAGE_SIZE);
            }}
          >
            <SelectTrigger
              className="h-10 w-full sm:w-40"
              aria-label={t("scopeFilter")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("scopeAll")}</SelectItem>
              <SelectItem value="organization">
                {t("scopeOrganization")}
              </SelectItem>
              <SelectItem value="private">{t("scopePrivate")}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sourceFilter}
            onValueChange={(value) => {
              setSourceFilter(value as "all" | "imported" | "manual");
              setVisibleCount(SKILLS_PAGE_SIZE);
            }}
          >
            <SelectTrigger
              className="h-10 w-full sm:w-40"
              aria-label={t("sourceFilter")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("sourceAll")}</SelectItem>
              <SelectItem value="imported">{t("sourceImported")}</SelectItem>
              <SelectItem value="manual">{t("sourceManual")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-10 shrink-0">
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
              {t("addSkill")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onSelect={() =>
                window.requestAnimationFrame(() => setInstallOpen(true))
              }
            >
              <BookMarkedIcon aria-hidden="true" />
              {t("installTitle")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                window.requestAnimationFrame(() => setEditorState({}))
              }
            >
              <PencilIcon aria-hidden="true" />
              {t("createFromScratch")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground" aria-live="polite">
        {t("resultsCount", {
          visible: Math.min(visibleCount, filteredSkills.length),
          total: filteredSkills.length,
        })}
      </p>
    </div>
  );
}
