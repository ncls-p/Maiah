import { z } from "zod";
import { receiveGenesysWebhook } from "@/modules/genesys/webhook";
import { GenesysError } from "@/modules/genesys/contracts";
import { genesysResponse } from "@/modules/genesys/route-response";
export async function POST(
  req: Request,
  context: { params: Promise<{ connectionId: string }> },
) {
  return genesysResponse(async () => {
    const connectionId = z.uuid().parse((await context.params).connectionId);
    const reader = req.body?.getReader();
    if (!reader) throw new GenesysError("INVALID_REQUEST", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64_000) {
        await reader.cancel();
        throw new GenesysError("PAYLOAD_TOO_LARGE", 413);
      }
      chunks.push(value);
    }
    await receiveGenesysWebhook(
      connectionId,
      Buffer.concat(chunks).toString("utf8"),
      req.headers.get("x-hub-signature-256"),
    );
    return { ok: true };
  });
}
