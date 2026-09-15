import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export type BedrockDraft = {
  region: string;
  authMode: "api-key" | "iam";
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  clearSessionToken?: boolean;
};
export const emptyBedrock: BedrockDraft = {
  region: "eu-west-1",
  authMode: "api-key",
  accessKeyId: "",
  secretAccessKey: "",
  sessionToken: "",
};
export function BedrockFields({
  value,
  onChange,
  editing = false,
}: {
  value: BedrockDraft;
  onChange: (value: BedrockDraft) => void;
  editing?: boolean;
}) {
  const t = useTranslations("providers.bedrock");
  return (
    <div className="grid gap-4 rounded-xl border bg-muted/20 p-4">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <div className="grid gap-2">
        <Label htmlFor="bedrock-region">{t("region")}</Label>
        <Input
          id="bedrock-region"
          value={value.region}
          onChange={(e) => onChange({ ...value, region: e.target.value })}
          placeholder="eu-west-1"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="bedrock-auth">{t("authentication")}</Label>
        <Select
          value={value.authMode}
          onValueChange={(v) =>
            onChange({
              ...value,
              authMode: v as BedrockDraft["authMode"],
              accessKeyId: "",
              secretAccessKey: "",
              sessionToken: "",
            })
          }
        >
          <SelectTrigger id="bedrock-auth">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="api-key">{t("apiKey")}</SelectItem>
            <SelectItem value="iam">{t("iam")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {value.authMode === "iam" ? (
        <>
          {(["accessKeyId", "secretAccessKey", "sessionToken"] as const).map(
            (key) => (
              <div key={key} className="grid gap-2">
                <Label htmlFor={`bedrock-${key}`}>{t(key)}</Label>
                <Input
                  id={`bedrock-${key}`}
                  type="password"
                  autoComplete="new-password"
                  value={value[key]}
                  onChange={(e) =>
                    onChange({ ...value, [key]: e.target.value })
                  }
                  placeholder={editing ? t("keepSecret") : undefined}
                />
              </div>
            ),
          )}
          {editing ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.clearSessionToken === true}
                onChange={(event) =>
                  onChange({
                    ...value,
                    clearSessionToken: event.target.checked,
                    sessionToken: "",
                  })
                }
              />
              {t("clearSessionToken")}
            </label>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
