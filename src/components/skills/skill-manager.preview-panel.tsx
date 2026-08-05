"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
Card,
CardContent,
CardDescription,
CardHeader,
CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs,TabsList,TabsTrigger } from "@/components/ui/tabs";
import {
BookMarkedIcon,
FileTextIcon,
Loader2Icon,
SearchIcon
} from "lucide-react";
import {
useState
} from "react";
import { BUTTON_TYPE,SkillPreview } from "./skill-manager.button-type";


// ─── Preview Panel ─────────────────────────────────────────────────────

export function PreviewPanel({
  preview,
  onInstall,
  installing,
}: {
  preview: SkillPreview[];
  onInstall: () => void;
  installing: boolean;
}) {
  const t = useTranslations("tools.skills");
  const [expandedSkill, setExpandedSkill] = useState(0);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const skill = preview[expandedSkill];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SearchIcon className="size-4" />
          {t("previewTitle", { count: preview.length })}
        </CardTitle>
        <CardDescription>{t("previewDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preview.length > 1 && (
          <Tabs
            value={String(expandedSkill)}
            onValueChange={(v) => {
              setExpandedSkill(Number(v));
              setExpandedFile(null);
            }}
          >
            <TabsList>
              {preview.map((s, i) => (
                <TabsTrigger key={i} value={String(i)}>
                  {s.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {skill && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{skill.sourcePackage}</Badge>
              <Badge variant="secondary">
                {t("fileCount", { count: skill.markdownFiles.length })}
              </Badge>
            </div>

            {skill.description && (
              <p className="text-sm text-muted-foreground">
                {skill.description}
              </p>
            )}

            <details
              open
              onToggle={(e) => {
                if (!e.currentTarget.open) setExpandedFile(null);
              }}
            >
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                {t("filesIncluded")}
              </summary>
              <div className="mt-2 space-y-1">
                {skill.markdownFiles.map((file) => (
                  <div key={file.path} className="group">
                    <button
                      type={BUTTON_TYPE}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted"
                      onClick={() =>
                        setExpandedFile(
                          expandedFile === file.path ? null : file.path,
                        )
                      }
                    >
                      <FileTextIcon className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono">{file.path}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {t("byteCount", {
                          count: new Blob([file.content]).size,
                        })}
                      </span>
                    </button>
                    {expandedFile === file.path && (
                      <div className="mt-1 rounded border bg-muted/30 p-3">
                        <ScrollArea className="max-h-60">
                          <pre className="whitespace-pre-wrap text-[11px] leading-relaxed font-sans">
                            {file.content}
                          </pre>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>

            <div className="flex justify-end">
              <Button onClick={() => void onInstall()} disabled={installing}>
                {installing ? (
                  <Loader2Icon className="mr-1 size-3 animate-spin" />
                ) : (
                  <BookMarkedIcon className="mr-1 size-3.5" />
                )}
                {t("installReviewed", { count: preview.length })}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
