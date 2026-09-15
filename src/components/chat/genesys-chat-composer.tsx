"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
export function GenesysChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("genesys");
  return (
    <form
      className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pb-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && value.trim()) onSubmit();
      }}
    >
      <Field>
        <FieldLabel htmlFor="genesys-human-message">
          {t("humanMessage")}
        </FieldLabel>
        <Textarea
          id="genesys-human-message"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={3000}
          disabled={disabled}
          placeholder={t("humanPlaceholder")}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (!disabled && value.trim()) onSubmit();
            }
          }}
        />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t("textOnly")}</p>
        <Button type="submit" disabled={disabled || !value.trim()}>
          {t("sendHuman")}
        </Button>
      </div>
    </form>
  );
}
