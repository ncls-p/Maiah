"use client";

import type { ComponentProps, ReactNode } from "react";

import { ChatLayout } from "@/components/chat/chat-layout";
import { ChatPageLoading, NoAssistantsState } from "./chat-page-view";

type LayoutProps = Omit<ComponentProps<typeof ChatLayout>, "children" | "loadingSidebar">;

export function ChatPageBoundary(props: {
  state: "loading" | "empty";
  layoutProps: LayoutProps;
  loadingContext: boolean;
  destructiveDialog: ReactNode;
  emptyStateProps: ComponentProps<typeof NoAssistantsState>;
  loadingStateProps: ComponentProps<typeof ChatPageLoading>;
}) {
  const child = props.state === "loading" ? <ChatPageLoading {...props.loadingStateProps} /> : <NoAssistantsState {...props.emptyStateProps} />;
  return (
    <>
      <ChatLayout {...props.layoutProps} loadingSidebar={props.state === "loading" || props.loadingContext}>
        {child}
      </ChatLayout>
      {props.destructiveDialog}
    </>
  );
}
