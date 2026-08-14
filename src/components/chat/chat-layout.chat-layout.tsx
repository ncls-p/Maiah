"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { ChatAgentSelector } from "@/components/chat/chat-agent-selector";
import { ChatComposerImpact } from "@/components/chat/chat-composer-impact";
import { ChatReasoningSlider } from "@/components/chat/chat-reasoning-slider";
import { useWorkspace } from "@/hooks/use-workspace";
import type { ReasoningPreset } from "@/modules/agent/reasoning-presets";
import { ChatLayoutProps } from "./chat-layout.chat-composer-controls-context";
import { ChatLayoutView } from "./chat-layout.chat-layout.view";

export function useChatLayoutController(props: ChatLayoutProps) {
  const t = useTranslations("chat");
  const { workspaceId } = useWorkspace();
  const [setupOpen, setSetupOpen] = useState(false);
  const { onReasoningEffortChange } = props;
  const handleReasoningEffortChange = useCallback(
    (value: ReasoningPreset) => {
      onReasoningEffortChange?.(value);
    },
    [onReasoningEffortChange],
  );
  const hasImpact = Boolean(
    props.conversationImpact &&
    (props.conversationImpact.cost !== null ||
      props.conversationImpact.energyKwh !== null),
  );
  const composerControls = {
    primary: (
      <div className="flex min-w-0 items-center gap-1">
        <ChatAgentSelector
          agents={props.agents}
          selectedAgent={props.selectedAgent}
          activeConversationId={props.activeConversationId}
          conversationIsOwner={props.conversationIsOwner ?? true}
          workspaceId={workspaceId}
          organizationDefaultAgentId={props.organizationDefaultAgentId}
          userDefaultAgentId={props.userDefaultAgentId}
          isLoading={props.isLoading ?? false}
          needsSetup={props.needsSetup ?? false}
          canCreateAgent={props.canCreateAgent ?? false}
          onSelectAgent={props.onSelectAgent}
          onSetUserDefaultAgent={props.onSetUserDefaultAgent}
        />
        {props.reasoningPresets?.length && props.reasoningEffort ? (
          <ChatReasoningSlider
            presets={props.reasoningPresets}
            value={props.reasoningEffort}
            disabled={props.isLoading || props.needsSetup}
            onChange={handleReasoningEffortChange}
          />
        ) : null}
      </div>
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
