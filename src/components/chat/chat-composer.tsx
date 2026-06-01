"use client";

import Link from "next/link";
import { Loader2, SendIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatComposerProps {
  input: string;
  canChat: boolean;
  sending: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
}

export function ChatComposer({
  input,
  canChat,
  sending,
  onSubmit,
  onInputChange,
}: ChatComposerProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="w-full min-w-0 shrink-0 bg-transparent px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-3"
    >
      <div className="mx-auto w-full min-w-0 max-w-4xl">
        <div className="composer-box rounded-xl sm:rounded-2xl">
          <div className="flex items-end gap-1.5 p-1.5 sm:gap-2 sm:p-2">
            <Textarea
              aria-label="Message"
              name="message"
              autoComplete="off"
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={
                canChat
                  ? "Message your assistant…"
                  : "Finish setup before chatting…"
              }
              disabled={sending || !canChat}
              rows={1}
              className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0 sm:max-h-40 sm:min-h-12 sm:px-3 sm:py-3 sm:text-sm"
            />
            <Button
              type="submit"
              size="icon"
              disabled={sending || !input.trim() || !canChat}
              aria-label="Send message"
              className="size-9 shrink-0 rounded-lg shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 sm:size-10 sm:rounded-xl"
            >
              {sending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <SendIcon aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
        {!canChat ? (
          <p className="mt-2 px-1 text-center text-xs text-muted-foreground animate-in-fade">
            This assistant needs a provider and model.{" "}
            <Link
              href="/agents"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Configure assistant
            </Link>
          </p>
        ) : null}
      </div>
    </form>
  );
}
