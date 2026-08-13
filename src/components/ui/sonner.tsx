"use client";

import { useTheme } from "@teispace/next-themes";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast, Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <div
      // Clicking anywhere on a toast dismisses it, without stealing clicks
      // from its interactive children (close/action buttons, links).
      onClickCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, a, [role='button']")) return;
        if (target.closest("[data-sonner-toast]")) toast.dismiss();
      }}
    >
      <Sonner
        theme={theme as ToasterProps["theme"]}
        className="toaster group"
        closeButton
        icons={{
          success: <CircleCheckIcon className="size-4" />,
          info: <InfoIcon className="size-4" />,
          warning: <TriangleAlertIcon className="size-4" />,
          error: <OctagonXIcon className="size-4" />,
          loading: <Loader2Icon className="size-4 animate-spin" />,
        }}
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
            "--border-radius": "var(--radius)",
          } as React.CSSProperties
        }
        toastOptions={{
          classNames: {
            toast: "cn-toast cursor-pointer",
            // Long unbreakable tokens (model ids, URLs) must wrap instead of
            // being clipped by the fixed toast width.
            title: "break-words [overflow-wrap:anywhere]",
            description: "break-words [overflow-wrap:anywhere]",
          },
        }}
        {...props}
      />
    </div>
  );
};

export { Toaster };
