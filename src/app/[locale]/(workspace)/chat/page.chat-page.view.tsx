import { type CSSProperties } from "react";

import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatLayout } from "@/components/chat/chat-layout";
import { ChatMessageList,CodeWorkspaceArtifactCard } from "@/components/chat/chat-message-list";
import { CodeWorkspaceResizeHandle } from "@/components/chat/code-workspace-artifact-card";
import { MAX_CHAT_WIDTH,MIN_CHAT_WIDTH } from "@/components/chat/code-workspace-layout";
import { CODING_INTERFACE_MODE } from "./chat-interface-mode";
import { ChatContextBar } from "./chat-page-helpers";
import { CodeWorkspaceModeBar,EmptyConversationState } from "./chat-page-view";
import type { useChatPageController } from "./page.chat-page";

type Model = Extract<ReturnType<typeof useChatPageController>, { kind: "ready" }>;
export function ChatPageView({ model }: { model: Model }) {
  const {
    activeConversationId,
    agents,
    approveToolInvocation,
    attachments,
    bottomRef,
    canChat,
    canCreateAgent,
    canRunSetup,
    cancelQueuedMessage,
    chooseInterfaceMode,
    codeWorkspaceArtifact,
    codingChatWidth,
    continueAssistantResponse,
    conversationImpact,
  } = model;
  const {
    deleteMessage, editMessage, emptyPromptSuggestions, input, interfaceMode,
    latestTodoList, loadingMessages, messages, organizationDefaultAgentId, pendingApprovals,
  } = model;
  const {
    queuedMessages, quota, rejectToolInvocation, reloadActualLatestMessages,
    reloadAgentContext, resendMessage, selectAgent, selectedAgent, selectedAgentId,
    sending, setAttachments,
  } = model;
  const {
    setInput, setUserDefaultAgent, stopGeneration, submitMessage, submitSuggestion, t, updateCodingChatWidth,
    updateQueuedMessage, uploadChatAttachment, uploadCodeWorkspace, userDefaultAgentId,
    workspaceId,
  } = model;
  return (
      <ChatLayout
        agents={agents}
        selectedAgent={selectedAgent}
        selectedAgentId={selectedAgentId}
        activeConversationId={activeConversationId}
        conversationImpact={conversationImpact}
        organizationDefaultAgentId={organizationDefaultAgentId}
        userDefaultAgentId={userDefaultAgentId}
        canChat={canChat}
        canCreateAgent={canCreateAgent}
        canRunSetup={canRunSetup}
        onSelectAgent={selectAgent}
        onSetUserDefaultAgent={(agentId: string | null) => void setUserDefaultAgent(agentId)}
        onSetupComplete={() => void reloadAgentContext()}
      >
        <ChatContextBar quota={quota} />
        {codeWorkspaceArtifact ? <CodeWorkspaceModeBar artifact={codeWorkspaceArtifact} interfaceMode={interfaceMode} onModeChange={chooseInterfaceMode} /> : null}
        {interfaceMode === CODING_INTERFACE_MODE && codeWorkspaceArtifact ? (
          <section
            className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-background lg:[grid-template-columns:var(--coding-chat-width)_0.75rem_minmax(0,1fr)]"
            style={
              {
                "--coding-chat-width": `${codingChatWidth}px`,
              } as CSSProperties
            }
          >
            <aside className="flex min-h-0 flex-col bg-muted/10" id="coding-chat-panel">
              <div className="border-b border-border/50 px-3 py-2">
                <p className="text-xs font-medium text-foreground">{t("codingPanelTitle")}</p>
                <p className="text-[11px] text-muted-foreground">{t("codingPanelDescription")}</p>
              </div>
              <section className="min-h-0 flex-1 overflow-hidden">
                <div className="size-full min-h-0">
                  <ChatMessageList key={activeConversationId ?? "new-conversation"} messages={messages} sending={sending} loading={loadingMessages} workspaceId={workspaceId ?? undefined} workspaceArtifactDisplay="summary" conversationId={activeConversationId} bottomRef={bottomRef} onEditMessage={editMessage} onDeleteMessage={deleteMessage} onResendMessage={resendMessage} onRegenerateAssistant={resendMessage} onContinueAssistant={continueAssistantResponse} onJumpLatest={reloadActualLatestMessages} pendingApprovals={pendingApprovals} onApproveTool={approveToolInvocation} onRejectTool={rejectToolInvocation} onSuggestionClick={submitSuggestion} />
                </div>
              </section>
              <ChatComposer input={input} canChat={canChat} sending={sending} queuedMessages={queuedMessages} onInputChange={setInput} onSubmit={submitMessage} onStop={stopGeneration} onQueuedMessageChange={updateQueuedMessage} onQueuedMessageCancel={cancelQueuedMessage} onUploadCodeWorkspace={uploadCodeWorkspace} onUploadChatAttachment={uploadChatAttachment} attachments={attachments} todoList={latestTodoList} onRemoveAttachment={(attachmentId) => setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId))} />
            </aside>
            <CodeWorkspaceResizeHandle controls="coding-chat-panel" label={t("resizeCodingChat")} maximum={MAX_CHAT_WIDTH} minimum={MIN_CHAT_WIDTH} onResize={updateCodingChatWidth} value={codingChatWidth} />
            <div className="min-h-0 overflow-hidden">
              <CodeWorkspaceArtifactCard artifact={codeWorkspaceArtifact} workspaceId={workspaceId ?? undefined} variant="workbench" />
            </div>
          </section>
        ) : (
          <section className="min-h-0 flex-1 overflow-hidden">
            {!loadingMessages && messages.length === 0 ? <EmptyConversationState canChat={canChat} t={t} /> : null}
            <div className="size-full min-h-0">
              <ChatMessageList key={activeConversationId ?? "new-conversation"} messages={messages} sending={sending} loading={loadingMessages} workspaceId={workspaceId ?? undefined} conversationId={activeConversationId} bottomRef={bottomRef} onEditMessage={editMessage} onDeleteMessage={deleteMessage} onResendMessage={resendMessage} onRegenerateAssistant={resendMessage} onContinueAssistant={continueAssistantResponse} onJumpLatest={reloadActualLatestMessages} pendingApprovals={pendingApprovals} onApproveTool={approveToolInvocation} onRejectTool={rejectToolInvocation} onSuggestionClick={submitSuggestion} />
            </div>
          </section>
        )}
        {interfaceMode === CODING_INTERFACE_MODE && codeWorkspaceArtifact ? null : <ChatComposer input={input} canChat={canChat} sending={sending} queuedMessages={queuedMessages} onInputChange={setInput} onSubmit={submitMessage} onStop={stopGeneration} onQueuedMessageChange={updateQueuedMessage} onQueuedMessageCancel={cancelQueuedMessage} onUploadCodeWorkspace={uploadCodeWorkspace} onUploadChatAttachment={uploadChatAttachment} attachments={attachments} todoList={latestTodoList} centered={!loadingMessages && messages.length === 0} promptSuggestions={emptyPromptSuggestions} onPromptSuggestionClick={submitSuggestion} onRemoveAttachment={(attachmentId) => setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId))} />}
      </ChatLayout>
  );
}
