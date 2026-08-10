import type { Metadata } from "next";

import { PublicConversation } from "./public-conversation";

export const metadata: Metadata = { title: "Shared conversation" };

export default async function PublicConversationPage({
  params,
}: {
  params: Promise<{ publicShareId: string }>;
}) {
  const { publicShareId } = await params;
  return <PublicConversation publicShareId={publicShareId} />;
}
