"use client";

import { useLayoutEffect, useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import {
	CheckIcon,
	ChevronDownIcon,
	CircleDotDashedIcon,
	CopyIcon,
	PencilIcon,
	RefreshCcwIcon,
	Trash2Icon,
} from "lucide-react";

import {
	MessageContent,
	StreamingStatus,
} from "@/components/chat/chat-message-rendering";
import { shouldUseMessageScrollAnchor } from "@/components/chat/chat-scroll";
import {
	textFromMessage,
	type ChatMessage,
	type PendingToolApproval,
} from "@/components/chat/chat-types";
import type { WorkspaceArtifactDisplay } from "@/components/chat/code-workspace-artifact-card";
export {
	CODE_WORKSPACE_ARTIFACT_EVENT,
	CodeWorkspaceArtifactCard,
} from "@/components/chat/code-workspace-artifact-card";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
	Message as MessagePrimitive,
	MessageContent as MessagePrimitiveContent,
	MessageFooter,
} from "@/components/ui/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
	useMessageScroller,
	useMessageScrollerScrollable,
	useMessageScrollerVisibility,
} from "@/components/ui/message-scroller";
import { Skeleton } from "@/components/ui/skeleton";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { copyRichHtml } from "@/lib/rich-clipboard";
import { cn } from "@/lib/utils";

const INITIAL_VISIBLE_MESSAGES = 60;
const LOAD_MORE_MESSAGES = 30;
const EMPTY_PENDING_APPROVALS: PendingToolApproval[] = [];
const BUTTON_TYPE = "button";
const OUTLINE_VARIANT = "outline";
const GHOST_VARIANT = "ghost";
const COMPACT_ICON_CLASS = "size-3";
const USER_MESSAGE_PREVIEW_LENGTH = 180;
const MESSAGE_JUMP_SCROLL_MARGIN = 24;

interface ChatMessageListProps {
	messages: ChatMessage[];
	sending: boolean;
	loading?: boolean;
	workspaceId?: string;
	workspaceArtifactDisplay?: WorkspaceArtifactDisplay;
	conversationId?: string | null;
	bottomRef: React.RefObject<HTMLDivElement | null>;
	onEditMessage?: (
		message: ChatMessage,
		content: string,
	) => Promise<void> | void;
	onDeleteMessage?: (message: ChatMessage) => Promise<void> | void;
	onResendMessage?: (message: ChatMessage) => Promise<void> | void;
	onRegenerateAssistant?: (message: ChatMessage) => Promise<void> | void;
	pendingApprovals?: PendingToolApproval[];
	onApproveTool?: (approval: PendingToolApproval) => void;
	onRejectTool?: (approval: PendingToolApproval) => void;
	onSuggestionClick?: (suggestion: string) => void;
}

function chatAnchorStorageKey(conversationId: string) {
	return `ai-hub-chat-anchor:${conversationId}`;
}

function SavedMessageAnchorRestorer({
	conversationId,
}: {
	conversationId?: string | null;
}) {
	const { scrollToMessage } = useMessageScroller();
	const restoredConversationIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (
			!conversationId ||
			restoredConversationIdRef.current === conversationId
		) {
			return;
		}
		restoredConversationIdRef.current = conversationId;
		const hashMessageId = window.location.hash.startsWith("#message-")
			? window.location.hash.slice("#message-".length)
			: null;
		const savedMessageId =
			hashMessageId ??
			window.localStorage.getItem(chatAnchorStorageKey(conversationId));
		if (!savedMessageId) return;
		const frame = window.requestAnimationFrame(() => {
			scrollToMessage(savedMessageId, {
				align: "start",
				behavior: "auto",
				scrollMargin: 24,
			});
		});
		return () => window.cancelAnimationFrame(frame);
	}, [conversationId, scrollToMessage]);

	return null;
}

function MessageVisibilityPersistence({
	conversationId,
}: {
	conversationId?: string | null;
}) {
	const { currentAnchorId } = useMessageScrollerVisibility();

	useEffect(() => {
		if (!conversationId || !currentAnchorId) return;
		window.localStorage.setItem(
			chatAnchorStorageKey(conversationId),
			currentAnchorId,
		);
	}, [conversationId, currentAnchorId]);

	return null;
}

interface UserMessageShortcut {
	id: string;
	messageIndex: number;
	ordinal: number;
	preview: string;
	fullText: string;
}

function fallbackUserMessageText(message: ChatMessage) {
	const attachmentCount = message.parts.filter(
		(part) => part.type === "file" || part.type === "image",
	).length;
	if (attachmentCount === 1) return "Message with 1 attachment";
	if (attachmentCount > 1) return `Message with ${attachmentCount} attachments`;

	return "Empty user message";
}

function userMessageFullText(message: ChatMessage) {
	return textFromMessage(message).trim() || fallbackUserMessageText(message);
}

function userMessagePreview(message: ChatMessage) {
	const normalizedText = userMessageFullText(message)
		.replace(/\s+/g, " ")
		.trim();
	if (normalizedText.length > USER_MESSAGE_PREVIEW_LENGTH) {
		return `${normalizedText.slice(0, USER_MESSAGE_PREVIEW_LENGTH).trimEnd()}…`;
	}

	return normalizedText;
}

function preferredScrollBehavior(): ScrollBehavior {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches
		? "auto"
		: "smooth";
}

function rememberUserMessageAnchor(
	conversationId: string | null | undefined,
	messageId: string,
) {
	window.history.replaceState(null, "", `#message-${messageId}`);
	if (!conversationId) return;
	window.localStorage.setItem(chatAnchorStorageKey(conversationId), messageId);
}

function ChatScrollControls({ sending }: { sending: boolean }) {
	const scrollable = useMessageScrollerScrollable();

	return (
		<>
			{sending && scrollable.end ? (
				<div className="pointer-events-none absolute inset-x-3 bottom-16 z-10 flex justify-center">
					<Marker className="w-fit rounded-full border bg-background/95 px-3 py-1.5 shadow-sm backdrop-blur">
						<MarkerIcon>
							<CircleDotDashedIcon data-icon="inline-start" />
						</MarkerIcon>
						<MarkerContent>Response is still streaming below</MarkerContent>
					</Marker>
				</div>
			) : null}
			<MessageScrollerButton
				direction="end"
				variant="secondary"
				size="sm"
				className="z-20 rounded-full px-3 shadow-sm"
			>
				<ChevronDownIcon data-icon="inline-start" />
				Jump to latest
			</MessageScrollerButton>
		</>
	);
}

function UserMessageRail({
	shortcuts,
	hiddenMessageCount,
	totalMessageCount,
	conversationId,
	messageIndexById,
	setVisibleMessageCount,
}: {
	shortcuts: UserMessageShortcut[];
	hiddenMessageCount: number;
	totalMessageCount: number;
	conversationId?: string | null;
	messageIndexById: ReadonlyMap<string, number>;
	setVisibleMessageCount: React.Dispatch<React.SetStateAction<number>>;
}) {
	const { scrollToMessage } = useMessageScroller();
	const { currentAnchorId } = useMessageScrollerVisibility();
	const [activeShortcutId, setActiveShortcutId] = useState<string | null>(null);
	const [isPanelOpen, setIsPanelOpen] = useState(false);
	const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
	const currentShortcutId = useMemo(() => {
		if (!currentAnchorId) return null;
		const currentAnchorIndex = messageIndexById.get(currentAnchorId);
		if (currentAnchorIndex === undefined) return null;

		let nearestUserShortcutId: string | null = null;
		for (const shortcut of shortcuts) {
			if (shortcut.messageIndex > currentAnchorIndex) break;
			nearestUserShortcutId = shortcut.id;
		}

		return nearestUserShortcutId;
	}, [currentAnchorId, messageIndexById, shortcuts]);

	useLayoutEffect(() => {
		if (!pendingMessageId) return;

		const pendingShortcut = shortcuts.find(
			(shortcut) => shortcut.id === pendingMessageId,
		);
		if (!pendingShortcut) return;
		if (pendingShortcut.messageIndex < hiddenMessageCount) return;

		const frame = window.requestAnimationFrame(() => {
			scrollToMessage(pendingMessageId, {
				align: "start",
				behavior: preferredScrollBehavior(),
				scrollMargin: MESSAGE_JUMP_SCROLL_MARGIN,
			});
			rememberUserMessageAnchor(conversationId, pendingMessageId);
			setPendingMessageId(null);
		});

		return () => window.cancelAnimationFrame(frame);
	}, [
		conversationId,
		hiddenMessageCount,
		pendingMessageId,
		scrollToMessage,
		shortcuts,
	]);

	if (shortcuts.length === 0) return null;

	const jumpToShortcut = (shortcut: UserMessageShortcut) => {
		const requiredVisibleCount = totalMessageCount - shortcut.messageIndex;
		if (shortcut.messageIndex < hiddenMessageCount) {
			setPendingMessageId(shortcut.id);
			setVisibleMessageCount((count) => Math.max(count, requiredVisibleCount));
			return;
		}

		scrollToMessage(shortcut.id, {
			align: "start",
			behavior: preferredScrollBehavior(),
			scrollMargin: MESSAGE_JUMP_SCROLL_MARGIN,
		});
		rememberUserMessageAnchor(conversationId, shortcut.id);
	};

	const closePanel = () => {
		setIsPanelOpen(false);
		setActiveShortcutId(null);
	};

	return (
		<nav
			aria-label="User message shortcuts"
			className="absolute right-1 top-1/2 z-30 hidden -translate-y-1/2 items-center gap-1.5 sm:flex"
			onMouseEnter={() => setIsPanelOpen(true)}
			onMouseLeave={closePanel}
			onBlur={(event) => {
				const nextFocusedElement = event.relatedTarget as Node | null;
				if (
					!nextFocusedElement ||
					!event.currentTarget.contains(nextFocusedElement)
				) {
					closePanel();
				}
			}}
		>
			{isPanelOpen ? (
				<div
					className="w-60 max-w-[calc(100vw-4rem)] rounded-xl bg-popover/95 p-1 text-left text-popover-foreground shadow-[0_10px_26px_rgba(15,23,42,0.12)] ring-1 ring-border/55 backdrop-blur-md transition-[opacity,transform] duration-150 ease-out"
					onWheelCapture={(event) => event.stopPropagation()}
				>
					<div className="flex max-h-[42vh] min-h-0 flex-col gap-0.5 overflow-y-auto overscroll-contain pr-1 scrollbar-thin">
						{shortcuts.map((shortcut) => {
							const isCurrent = currentShortcutId === shortcut.id;
							const isActive = activeShortcutId === shortcut.id;
							return (
								<button
									key={shortcut.id}
									type="button"
									aria-current={isCurrent ? "location" : undefined}
									aria-label={`Jump to user message ${shortcut.ordinal}: ${shortcut.preview}`}
									className={cn(
										"rounded-lg px-2 py-1 text-left outline-none transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/35 active:scale-[0.96]",
										(isActive || isCurrent) &&
											"bg-muted shadow-[0_6px_14px_rgba(15,23,42,0.07)]",
									)}
									onMouseEnter={() => setActiveShortcutId(shortcut.id)}
									onFocus={() => {
										setIsPanelOpen(true);
										setActiveShortcutId(shortcut.id);
									}}
									onClick={() => jumpToShortcut(shortcut)}
								>
									<span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
										Message {shortcut.ordinal}
									</span>
									<span
										className={cn(
											"mt-0.5 block text-[11px] leading-4 text-foreground transition-[color] duration-150",
											isActive
												? "whitespace-pre-wrap"
												: "line-clamp-1 text-muted-foreground",
										)}
									>
										{isActive ? shortcut.fullText : shortcut.preview}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			) : null}
			<button
				type="button"
				aria-expanded={isPanelOpen}
				aria-label={`${shortcuts.length} user messages. Show navigation list.`}
				className="flex flex-col items-center gap-0.5 rounded-full bg-background/50 px-1.5 py-1.5 shadow-[0_8px_22px_rgba(15,23,42,0.08)] outline-none ring-1 ring-border/45 backdrop-blur-md transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-background/80 focus-visible:ring-2 focus-visible:ring-ring/35 active:scale-[0.96]"
				onFocus={() => setIsPanelOpen(true)}
				onClick={() => setIsPanelOpen((open) => !open)}
			>
				{[0, 1, 2].map((index) => (
					<span
						key={index}
						aria-hidden="true"
						className="size-1 rounded-full bg-neutral-950/75 shadow-sm ring-1 ring-background/80 dark:bg-neutral-50/75"
					/>
				))}
			</button>
		</nav>
	);
}

export function ChatMessageList({
	messages,
	sending,
	loading,
	workspaceId,
	workspaceArtifactDisplay = "full",
	conversationId,
	bottomRef,
	onEditMessage,
	onDeleteMessage,
	onResendMessage,
	onRegenerateAssistant,
	pendingApprovals = [],
	onApproveTool,
	onRejectTool,
	onSuggestionClick,
}: ChatMessageListProps) {
	const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
	const [editingContent, setEditingContent] = useState("");
	const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
	const [visibleMessageCount, setVisibleMessageCount] = useState(
		INITIAL_VISIBLE_MESSAGES,
	);
	const hiddenMessageCount = Math.max(0, messages.length - visibleMessageCount);
	const visibleMessages = useMemo(
		() =>
			hiddenMessageCount > 0 ? messages.slice(hiddenMessageCount) : messages,
		[hiddenMessageCount, messages],
	);
	const messageIndexById = useMemo(
		() => new Map(messages.map((message, index) => [message.id, index])),
		[messages],
	);
	const userMessageShortcuts = useMemo(
		() =>
			messages
				.flatMap((message, messageIndex) =>
					message.role === "user"
						? [
								{
									id: message.id,
									messageIndex,
									ordinal: 0,
									preview: userMessagePreview(message),
									fullText: userMessageFullText(message),
								},
							]
						: [],
				)
				.map((shortcut, index) => ({ ...shortcut, ordinal: index + 1 })),
		[messages],
	);
	const messageListMeta = useMemo(() => {
		const precedingUserByMessageId = new Map<string, ChatMessage | null>();
		let lastUserMessage: ChatMessage | null = null;
		let lastAssistantMessageId: string | undefined;
		for (const message of visibleMessages) {
			precedingUserByMessageId.set(message.id, lastUserMessage);
			if (message.role === "assistant") lastAssistantMessageId = message.id;
			if (message.role === "user") lastUserMessage = message;
		}
		return { lastAssistantMessageId, precedingUserByMessageId };
	}, [visibleMessages]);
	const lastMessage = messages[messages.length - 1] ?? null;
	const lastMessageId = lastMessage?.id ?? null;
	const scrollFollowKey = useMemo(() => {
		if (!lastMessage) return `empty:${messages.length}`;
		return [
			messages.length,
			lastMessage.id,
			lastMessage.status ?? "",
			lastMessage.parts.length,
			textFromMessage(lastMessage).length,
		].join(":");
	}, [lastMessage, messages.length]);

	// Smart scroll: only follow the stream after the user explicitly reaches
	// the bottom. Posting from older history must preserve the current position.
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const shouldFollowStreamRef = useRef(false);
	const SCROLL_THRESHOLD = 10;

	useLayoutEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;

		const updateFollowStream = () => {
			const { scrollTop, scrollHeight, clientHeight } = viewport;
			shouldFollowStreamRef.current =
				scrollHeight - scrollTop - clientHeight <= SCROLL_THRESHOLD;
		};

		viewport.addEventListener("scroll", updateFollowStream, { passive: true });

		return () => {
			viewport.removeEventListener("scroll", updateFollowStream);
		};
	}, []);

	useLayoutEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport || !shouldFollowStreamRef.current) return;

		viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
	}, [scrollFollowKey, pendingApprovals.length]);

	if (loading) {
		return (
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
				<Skeleton className="h-20 w-2/3 rounded-2xl" />
				<Skeleton className="ml-auto h-16 w-1/2 rounded-2xl" />
				<Skeleton className="h-24 w-3/4 rounded-2xl" />
			</div>
		);
	}

	if (messages.length === 0) {
		return <div ref={bottomRef} />;
	}

	const { lastAssistantMessageId, precedingUserByMessageId } = messageListMeta;

	const viewportClassName =
		workspaceArtifactDisplay === "summary"
			? "px-2 py-3"
			: "px-3 py-4 sm:px-4 sm:py-8";

	return (
		<MessageScrollerProvider
			defaultScrollPosition="start"
			scrollMargin={24}
			scrollPreviousItemPeek={96}
		>
			<SavedMessageAnchorRestorer conversationId={conversationId} />
			<MessageVisibilityPersistence conversationId={conversationId} />
			<MessageScroller className="min-h-0 flex-1">
				<MessageScrollerViewport
					ref={viewportRef}
					preserveScrollOnPrepend
					className={viewportClassName}
					aria-label="Chat transcript"
				>
					<MessageScrollerContent className="mx-auto w-full max-w-4xl gap-5 pb-24">
						{hiddenMessageCount > 0 ? (
							<MessageScrollerItem className="flex justify-center">
								<Marker variant="separator" className="max-w-lg">
									<MarkerContent>
										<Button
											type={BUTTON_TYPE}
											variant={OUTLINE_VARIANT}
											size="sm"
											className="rounded-full text-xs text-muted-foreground"
											onClick={() =>
												setVisibleMessageCount(
													(count) => count + LOAD_MORE_MESSAGES,
												)
											}
										>
											{`Show ${Math.min(
												LOAD_MORE_MESSAGES,
												hiddenMessageCount,
											)} older messages`}
										</Button>
									</MarkerContent>
								</Marker>
							</MessageScrollerItem>
						) : null}
						{visibleMessages.map((message) => {
							const content = textFromMessage(message);
							const isAssistant = message.role === "assistant";
							const isUser = message.role === "user";
							const hasFilePart = message.parts.some(
								(part) => part.type === "file",
							);
							const canEdit = Boolean(onEditMessage) && (isUser || isAssistant);
							const canDelete = Boolean(onDeleteMessage);
							const canRegenerate =
								Boolean(onRegenerateAssistant) &&
								isAssistant &&
								message.status !== "streaming";
							const precedingUserMsg =
								precedingUserByMessageId.get(message.id) ?? null;
							const isEditing = editingMessageId === message.id;
							const isLast = message.id === lastMessageId;
							const isStreamingAssistant =
								isAssistant && message.status === "streaming";
							const shouldScrollAnchor = shouldUseMessageScrollAnchor({
								message,
								sending,
							});
							const isAnimating = sending && isLast && isStreamingAssistant;
							const messagePendingApprovals = isStreamingAssistant
								? pendingApprovals
								: EMPTY_PENDING_APPROVALS;
							const align = isUser ? "end" : "start";

							return (
								<MessageScrollerItem
									key={message.id}
									messageId={message.id}
									scrollAnchor={shouldScrollAnchor}
									id={`message-${message.id}`}
									className="scroll-mt-6 animate-in-up"
									style={{ animationDelay: isLast ? "0s" : undefined }}
								>
									<MessagePrimitive align={align}>
										<MessagePrimitiveContent
											className={cn(
												"transition-opacity duration-150",
												isUser && !hasFilePart
													? "max-w-[82%]"
													: "max-w-[min(100%,48rem)]",
												isLast && isAnimating && "animate-in-fade",
											)}
										>
											<Bubble
												align={align}
												variant={isUser ? "muted" : "ghost"}
												className={cn(isEditing && "ring-2 ring-primary/25")}
											>
												<BubbleContent
													className={cn(
														"transition-[background-color,box-shadow,color] duration-150 ease-out",
														isUser
															? "msg-bubble--user"
															: "msg-bubble--assistant",
													)}
												>
													<MessageContent
														message={message}
														showSuggestions={
															message.id === lastAssistantMessageId
														}
														isEditing={isEditing}
														editingContent={isEditing ? editingContent : ""}
														isSaving={savingMessageId === message.id}
														isAnimating={isAnimating}
														workspaceId={workspaceId}
														workspaceArtifactDisplay={workspaceArtifactDisplay}
														onEditingContentChange={
															isEditing ? setEditingContent : undefined
														}
														onCancelEdit={
															isEditing
																? () => {
																		setEditingMessageId(null);
																		setEditingContent("");
																	}
																: undefined
														}
														onSaveEdit={
															isEditing
																? async () => {
																		setSavingMessageId(message.id);
																		try {
																			await onEditMessage?.(
																				message,
																				editingContent.trim(),
																			);
																			setEditingMessageId(null);
																			setEditingContent("");
																		} finally {
																			setSavingMessageId(null);
																		}
																	}
																: undefined
														}
														pendingApprovals={messagePendingApprovals}
														onApproveTool={onApproveTool}
														onRejectTool={onRejectTool}
														onSuggestionClick={onSuggestionClick}
													/>
												</BubbleContent>
											</Bubble>

											{message.createdAt ? (
												<MessageFooter className="mt-1.5 gap-2 text-[11px] text-muted-foreground/60">
													<a
														href={`#message-${message.id}`}
														className="rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
														aria-label="Copy or open direct link to this message"
													>
														{new Date(message.createdAt).toLocaleTimeString(
															[],
															{
																hour: "2-digit",
																minute: "2-digit",
															},
														)}
													</a>
													{message.status === "streaming" ? (
														<StreamingStatus />
													) : null}
												</MessageFooter>
											) : null}

											<MessageActionBar
												message={message}
												sending={sending}
												canEdit={canEdit}
												canDelete={canDelete}
												canRegenerate={canRegenerate}
												onCopy={async () => {
													await copyRichHtml(markdownToHtml(content));
												}}
												onEdit={() => {
													setEditingMessageId(message.id);
													setEditingContent(content);
												}}
												onDelete={() => void onDeleteMessage?.(message)}
												onRegenerate={() => {
													if (precedingUserMsg) {
														void onResendMessage?.(precedingUserMsg);
													}
												}}
											/>
										</MessagePrimitiveContent>
									</MessagePrimitive>
								</MessageScrollerItem>
							);
						})}
						<div ref={bottomRef} aria-hidden="true" />
					</MessageScrollerContent>
				</MessageScrollerViewport>
				<UserMessageRail
					shortcuts={userMessageShortcuts}
					hiddenMessageCount={hiddenMessageCount}
					totalMessageCount={messages.length}
					conversationId={conversationId}
					messageIndexById={messageIndexById}
					setVisibleMessageCount={setVisibleMessageCount}
				/>
				<ChatScrollControls sending={sending} />
			</MessageScroller>
		</MessageScrollerProvider>
	);
}

function MessageActionBar({
	message,
	sending,
	canEdit,
	canDelete,
	canRegenerate,
	onCopy,
	onEdit,
	onDelete,
	onRegenerate,
}: {
	message: ChatMessage;
	sending: boolean;
	canEdit: boolean;
	canDelete: boolean;
	canRegenerate: boolean;
	onCopy: () => void;
	onEdit: () => void;
	onDelete: () => void;
	onRegenerate: () => void;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		onCopy();
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div
			className={cn(
				"mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100",
				message.role === "user" ? "justify-end" : "justify-start",
			)}
		>
			<Button
				type={BUTTON_TYPE}
				size="icon-sm"
				variant={GHOST_VARIANT}
				aria-label={copied ? "Copied" : "Copy message"}
				className="size-6"
				disabled={sending}
				onClick={handleCopy}
			>
				{copied ? (
					<CheckIcon className="size-3 text-success" aria-hidden="true" />
				) : (
					<CopyIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
				)}
			</Button>
			{canEdit ? (
				<Button
					type={BUTTON_TYPE}
					size="icon-sm"
					variant={GHOST_VARIANT}
					aria-label="Edit message"
					className="size-6"
					disabled={sending}
					onClick={onEdit}
				>
					<PencilIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
				</Button>
			) : null}
			{canDelete ? (
				<Button
					type={BUTTON_TYPE}
					size="icon-sm"
					variant={GHOST_VARIANT}
					aria-label="Delete message"
					className="size-6 text-destructive/70 hover:text-destructive"
					disabled={sending}
					onClick={onDelete}
				>
					<Trash2Icon className={COMPACT_ICON_CLASS} aria-hidden="true" />
				</Button>
			) : null}
			{canRegenerate ? (
				<Button
					type={BUTTON_TYPE}
					size="sm"
					variant={GHOST_VARIANT}
					aria-label="Regenerate response"
					className="h-6 gap-1 px-2 text-[11px]"
					disabled={sending}
					onClick={onRegenerate}
				>
					<RefreshCcwIcon className={COMPACT_ICON_CLASS} aria-hidden="true" />
					Regenerate
				</Button>
			) : null}
		</div>
	);
}
