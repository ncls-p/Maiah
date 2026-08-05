import { beforeEach,describe,expect,it,vi } from "vitest";


const storageMock = vi.hoisted(() => {
	const objects = new Map<
		string,
		{ bytes: Uint8Array; contentType?: string }
	>();
	return {
		objects,
		upload: vi.fn(
			async (key: string, value: Uint8Array | string, contentType?: string) => {
				objects.set(key, {
					bytes:
						typeof value === "string"
							? new TextEncoder().encode(value)
							: new Uint8Array(value),
					contentType,
				});
			},
		),
		download: vi.fn(async (key: string) => {
			const object = objects.get(key);
			if (!object) throw new Error(`missing ${key}`);
			return object.bytes;
		}),
		delete: vi.fn(async (key: string) => {
			objects.delete(key);
		}),
	};
});

vi.mock("@/server/infrastructure/storage", () => ({ storage: storageMock }));

import {
createChatAttachment,
getChatAttachment,
getChatAttachmentBytes,
getChatAttachmentExtractedText,
getChatImageAttachmentBytes
} from "@/modules/chat/attachments";

const workspaceId = "ws-1";
const userId = "user-1";

beforeEach(() => {
	vi.clearAllMocks();
	storageMock.objects.clear();
});

describe("chat attachments", () => {

	it("handles unreadable files, access checks, invalid metadata, and cleanup on failed upload", async () => {
		await expect(
			createChatAttachment({
				workspaceId,
				userId,
				fileName: "empty.txt",
				bytes: new Uint8Array(),
			}),
		).rejects.toThrow("empty");

		const binary = await createChatAttachment({
			workspaceId,
			userId,
			fileName: "archive.bin",
			mimeType: "application/octet-stream",
			bytes: new Uint8Array([0, 1, 2, 3, 4]),
		});
		expect(binary).toMatchObject({
			kind: "chat_file",
			category: "file",
			extractionStatus: "unreadable",
		});
		await expect(
			getChatAttachmentExtractedText({
				attachmentId: binary.id,
				workspaceId,
				userId,
			}),
		).resolves.toMatchObject({ text: "" });
		await expect(
			getChatAttachmentBytes({
				attachmentId: binary.id,
				workspaceId: "other",
				userId,
			}),
		).rejects.toThrow("Attachment not found");
		await expect(
			getChatImageAttachmentBytes({
				attachmentId: binary.id,
				workspaceId,
				userId,
			}),
		).rejects.toThrow("Attachment is not an image");

		const badId = "123e4567-e89b-12d3-a456-426614174000";
		storageMock.objects.set(`chat-attachments/${badId}/metadata.json`, {
			bytes: new TextEncoder().encode("not json"),
		});
		await expect(getChatAttachment(badId)).rejects.toThrow(
			"Failed to parse attachment metadata",
		);
		await expect(getChatAttachment("../bad")).rejects.toThrow(
			"Invalid attachment id",
		);

		storageMock.upload.mockRejectedValueOnce(new Error("upload failed"));
		await expect(
			createChatAttachment({
				workspaceId,
				userId,
				fileName: "fail.txt",
				bytes: new TextEncoder().encode("fail"),
			}),
		).rejects.toThrow("upload failed");
		expect(storageMock.delete).toHaveBeenCalled();
	});
});
