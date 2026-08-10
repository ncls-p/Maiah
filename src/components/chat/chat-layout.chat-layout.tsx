"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ChatAgentSelector } from "@/components/chat/chat-agent-selector";
import { ChatComposerImpact } from "@/components/chat/chat-composer-impact";
import { useWorkspace } from "@/hooks/use-workspace";
import { ChatLayoutProps } from "./chat-layout.chat-composer-controls-context";
import { ChatLayoutView } from "./chat-layout.chat-layout.view";

export function useChatLayoutController(props: ChatLayoutProps) {
  const t = useTranslations("chat");
  const { workspaceId } = useWorkspace();
  const [setupOpen, setSetupOpen] = useState(false);
  const hasImpact = Boolean(
    props.conversationImpact &&
    (props.conversationImpact.cost !== null ||
      props.conversationImpact.energyKwh !== null),
  );
  const composerControls = {
    primary: (
      <ChatAgentSelector
        agents={props.agents}
        selectedAgent={props.selectedAgent}
        activeConversationId={props.activeConversationId}
        conversationIsOwner={props.conversationIsOwner ?? true}
        workspaceId={workspaceId}
        organizationDefaultAgentId={props.organizationDefaultAgentId}
        userDefaultAgentId={props.userDefaultAgentId}
        canChat={props.canChat}
        canCreateAgent={props.canCreateAgent ?? false}
        onSelectAgent={props.onSelectAgent}
        onSetUserDefaultAgent={props.onSetUserDefaultAgent}
        ephemeral={props.ephemeral ?? false}
        onEphemeralChange={props.onEphemeralChange}
      />
    ),
    secondary:
      hasImpact && props.conversationImpact ? (
        <ChatComposerImpact impact={props.conversationImpact} />
      ) : null,
  };

  return {
    kind: "ready",
    canRunSetup: props.canRunSetup ?? false,
    children: props.children,
    composerControls,
    onSetupComplete: props.onSetupComplete,
    selectedAgentId: props.selectedAgentId,
    setSetupOpen,
    setupOpen,
    t,
  } as const;
}

export function ChatLayout(
  ...args: Parameters<typeof useChatLayoutController>
) {
  const model = useChatLayoutController(...args);
  if (!("kind" in model)) return model;
  return <ChatLayoutView model={model} />;
}
