"use client";

import type { ComponentProps } from "react";

import { ChatLayout } from "@/components/chat/chat-layout";
import { ChatPageLoading, NoAssistantsState } from "./chat-page-view";

type LayoutProps = Omit<ComponentProps<typeof ChatLayout>, "children">;

export function ChatPageBoundary(props: {
  state: "loading" | "empty";
  layoutProps: LayoutProps;
  emptyStateProps: ComponentProps<typeof NoAssistantsState>;
  loadingStateProps: ComponentProps<typeof ChatPageLoading>;
}) {
  const child = props.state === "loading" ? <ChatPageLoading {...props.loadingStateProps} /> : <NoAssistantsState {...props.emptyStateProps} />;
  return <ChatLayout {...props.layoutProps}>{child}</ChatLayout>;
}
