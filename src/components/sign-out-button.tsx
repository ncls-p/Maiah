"use client";

import { LogOutIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type ComponentProps, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { ACTIVE_WORKSPACE_STORAGE_KEY } from "@/lib/workspace-selection";

export function SignOutButton({
  iconOnly = false,
  className,
  onClick,
  disabled,
  ...buttonProps
}: {
  iconOnly?: boolean;
  className?: string;
} & ComponentProps<"button">) {
  const router = useRouter();
  const t = useTranslations("shell");
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);

    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error(t("signOutFailed"));

      window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
      router.push("/auth/signin");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("signOutFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? "icon" : "sm"}
      className={cn(
        "group justify-start rounded-xl transition-[background-color,color,scale] duration-150 ease-out hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) void signOut();
      }}
      disabled={pending || disabled}
      aria-label={t("signOut")}
      {...buttonProps}
    >
      {pending ? (
        <Spinner data-icon={iconOnly ? undefined : "inline-start"} />
      ) : (
        <LogOutIcon
          data-icon={iconOnly ? undefined : "inline-start"}
          aria-hidden="true"
          className="transition-transform duration-200 group-hover:translate-x-0.5"
        />
      )}
      {iconOnly ? (
        <span className="sr-only">{t("signOut")}</span>
      ) : (
        t("signOut")
      )}
    </Button>
  );
}
