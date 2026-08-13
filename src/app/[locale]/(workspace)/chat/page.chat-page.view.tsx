import { type CSSProperties } from "react";

import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatLayout } from "@/components/chat/chat-layout";
import {
  ChatMessageList,
  CodeWorkspaceArtifactCard,
} from "@/components/chat/chat-message-list";
import { CodeWorkspaceResizeHandle } from "@/components/chat/code-workspace-artifact-card";
import {
  MAX_CHAT_WIDTH,
  MIN_CHAT_WIDTH,
} from "@/components/chat/code-workspace-layout";
import { ConversationRetentionBanner } from "@/components/chat/temporary-conversation-banner";
import { CODING_INTERFACE_MODE } from "./chat-interface-mode";
import { ChatContextBar } from "./chat-page-helpers";
import { CodeWorkspaceModeBar, EmptyConversationState } from "./chat-page-view";
import type { useChatPageController } from "./page.chat-page";

type Model = Extract<
  ReturnType<typeof useChatPageController>,
  { kind: "ready" }
>;
export function ChatPageView({ model }: { model: Model }) {
  const {
    activeConversationId,
    agents,
    approveToolInvocation,
    attachments,
    bottomRef,
    canChat,
    needsSetup,
    isLoading,
    canCreateAgent,
    canRunSetup,
    cancelQueuedMessage,
    chooseInterfaceMode,
    codeWorkspaceArtifact,
    codingChatWidth,
    continueAssistantResponse,
    forkConversation,
    forkingMessageId,
    conversationImpact,
    conversationIsOwner,
    conversationReadOnly,
    convertingTemporaryConversation,
    effectiveEphemeral,
    effectiveEphemeralTtlMinutes,
    ephemeralExpiresAt,
    extendTemporaryConversation,
    extendingTemporaryConversation,
    makeConversationPersistent,
  } = model;
  const {
    deleteMessage,
    editMessage,
    emptyPromptSuggestions,
    input,
    interfaceMode,
    latestTodoList,
    loadingMessages,
    messages,
    organizationDefaultAgentId,
    pendingApprovals,
  } = model;
  const {
    queuedMessages,
    quota,
    rejectToolInvocation,
    reloadActualLatestMessages,
    reloadAgentContext,
    resendMessage,
    regenerateAssistantResponse,
    navigateConversationBranch,
    selectAgent,
    selectedAgent,
    selectedAgentId,
    sending,
    setAttachments,
  } = model;
  const {
    setInput,
    setUserDefaultAgent,
    stopGeneration,
    submitMessage,
    submitSuggestion,
    t,
    updateCodingChatWidth,
    updateQueuedMessage,
    uploadChatAttachment,
    uploadCodeWorkspace,
    userDefaultAgentId,
    workspaceId,
  } = model;
  return (
    <ChatLayout
      agents={agents}
      selectedAgent={selectedAgent}
      selectedAgentId={selectedAgentId}
      activeConversationId={activeConversationId}
      conversationImpact={conversationImpact}
      conversationIsOwner={conversationIsOwner}
      organizationDefaultAgentId={organizationDefaultAgentId}
      userDefaultAgentId={userDefaultAgentId}
      isLoading={isLoading}
      needsSetup={needsSetup}
      canCreateAgent={canCreateAgent}
      canRunSetup={canRunSetup}
      onSelectAgent={selectAgent}
      onSetUserDefaultAgent={(agentId: string | null) =>
        void setUserDefaultAgent(agentId)
      }
      onSetupComplete={() => void reloadAgentContext()}
    >
      <ChatContextBar quota={quota} />
      {effectiveEphemeral ? (
        <ConversationRetentionBanner
          temporary
          ttlMinutes={effectiveEphemeralTtlMinutes}
          expiresAt={ephemeralExpiresAt}
          hasConversation={Boolean(activeConversationId)}
          canConvert={conversationIsOwner}
          converting={convertingTemporaryConversation}
          extending={extendingTemporaryConversation}
          onConvert={() => void makeConversationPersistent()}
          onExtend={(ttlMinutes) =>
            void extendTemporaryConversation(ttlMinutes)
          }
        />
      ) : null}
      {conversationReadOnly ? (
        <div className="border-b bg-muted/40 px-4 py-2 text-center text-xs text-muted-foreground">
          {t("share.readOnlyNotice")}
        </div>
      ) : null}
      {codeWorkspaceArtifact ? (
        <CodeWorkspaceModeBar
          artifact={codeWorkspaceArtifact}
          interfaceMode={interfaceMode}
          onModeChange={chooseInterfaceMode}
        />
      ) : null}
      {interfaceMode === CODING_INTERFACE_MODE && codeWorkspaceArtifact ? (
        <section
          className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-background lg:[grid-template-columns:var(--coding-chat-width)_0.75rem_minmax(0,1fr)]"
          style={
            { "--coding-chat-width": `${codingChatWidth}px` } as CSSProperties
          }
        >
          <aside
            className="flex min-h-0 flex-col bg-muted/10"
            id="coding-chat-panel"
          >
            <div className="border-b border-border/50 px-3 py-2">
              <p className="text-xs font-medium text-foreground">
                {t("codingPanelTitle")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t("codingPanelDescription")}
              </p>
            </div>
            <section className="min-h-0 flex-1 overflow-hidden">
              <div className="size-full min-h-0">
                <ChatMessageList
                  key={activeConversationId ?? "new-conversation"}
                  messages={messages}
                  sending={sending}
                  loading={loadingMessages}
                  workspaceId={workspaceId ?? undefined}
                  workspaceArtifactDisplay="summary"
                  conversationId={activeConversationId}
                  bottomRef={bottomRef}
                  onEditMessage={editMessage}
                  onDeleteMessage={deleteMessage}
                  onResendMessage={resendMessage}
                  onRegenerateAssistant={regenerateAssistantResponse}
                  onContinueAssistant={continueAssistantResponse}
                  onForkMessage={forkConversation}
                  onNavigateBranch={navigateConversationBranch}
                  forkingMessageId={forkingMessageId}
                  onJumpLatest={reloadActualLatestMessages}
                  pendingApprovals={pendingApprovals}
                  onApproveTool={approveToolInvocation}
                  onRejectTool={rejectToolInvocation}
                  onSuggestionClick={submitSuggestion}
                />
              </div>
            </section>
            <ChatComposer
              input={input}
              canChat={canChat}
              needsSetup={needsSetup}
              sending={sending}
              queuedMessages={queuedMessages}
              onInputChange={setInput}
              onSubmit={submitMessage}
              onStop={stopGeneration}
              onQueuedMessageChange={updateQueuedMessage}
              onQueuedMessageCancel={cancelQueuedMessage}
              onUploadCodeWorkspace={uploadCodeWorkspace}
              onUploadChatAttachment={uploadChatAttachment}
              attachments={attachments}
              todoList={latestTodoList}
              onRemoveAttachment={(attachmentId) =>
                setAttachments((current) =>
                  current.filter(
                    (attachment) => attachment.id !== attachmentId,
                  ),
                )
              }
            />
          </aside>
          <CodeWorkspaceResizeHandle
            controls="coding-chat-panel"
            label={t("resizeCodingChat")}
            maximum={MAX_CHAT_WIDTH}
            minimum={MIN_CHAT_WIDTH}
            onResize={updateCodingChatWidth}
            value={codingChatWidth}
          />
          <div className="min-h-0 overflow-hidden">
            <CodeWorkspaceArtifactCard
              artifact={codeWorkspaceArtifact}
              workspaceId={workspaceId ?? undefined}
              variant="workbench"
            />
          </div>
        </section>
      ) : (
        <section className="min-h-0 flex-1 overflow-hidden">
          {!loadingMessages && messages.length === 0 ? (
            <EmptyConversationState needsSetup={needsSetup} t={t} />
          ) : null}
          <div className="size-full min-h-0">
            <ChatMessageList
              key={activeConversationId ?? "new-conversation"}
              messages={messages}
              sending={sending}
              loading={loadingMessages}
              workspaceId={workspaceId ?? undefined}
              conversationId={activeConversationId}
              bottomRef={bottomRef}
              onEditMessage={editMessage}
              onDeleteMessage={deleteMessage}
              onResendMessage={resendMessage}
              onRegenerateAssistant={regenerateAssistantResponse}
              onContinueAssistant={continueAssistantResponse}
              onForkMessage={forkConversation}
              onNavigateBranch={navigateConversationBranch}
              forkingMessageId={forkingMessageId}
              onJumpLatest={reloadActualLatestMessages}
              pendingApprovals={pendingApprovals}
              onApproveTool={approveToolInvocation}
              onRejectTool={rejectToolInvocation}
              onSuggestionClick={submitSuggestion}
            />
          </div>
        </section>
      )}
      {interfaceMode === CODING_INTERFACE_MODE &&
      codeWorkspaceArtifact ? null : (
        <ChatComposer
          input={input}
          canChat={canChat}
          needsSetup={needsSetup}
          sending={sending}
          queuedMessages={queuedMessages}
          onInputChange={setInput}
          onSubmit={submitMessage}
          onStop={stopGeneration}
          onQueuedMessageChange={updateQueuedMessage}
          onQueuedMessageCancel={cancelQueuedMessage}
          onUploadCodeWorkspace={uploadCodeWorkspace}
          onUploadChatAttachment={uploadChatAttachment}
          attachments={attachments}
          todoList={latestTodoList}
          centered={!loadingMessages && messages.length === 0}
          promptSuggestions={emptyPromptSuggestions}
          onPromptSuggestionClick={submitSuggestion}
          onRemoveAttachment={(attachmentId) =>
            setAttachments((current) =>
              current.filter((attachment) => attachment.id !== attachmentId),
            )
          }
        />
      )}
    </ChatLayout>
  );
}
