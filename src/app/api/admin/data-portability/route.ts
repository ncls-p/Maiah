import { z } from "zod";
import { env } from "@/lib/env";
import { requireAdminApiSession } from "@/modules/admin/auth";
import {
  digest,
  MAX_ARCHIVE_BYTES,
  openSnapshot,
  sealSnapshot,
} from "@/modules/data-portability/archive";
import {
  signConfirmation,
  verifyConfirmation,
} from "@/modules/data-portability/confirmation";
import {
  assertPortabilityMaintenance,
  connectRuntimePortability,
} from "@/modules/data-portability/runtime";
import {
  createSnapshot,
  restoreSnapshot,
} from "@/modules/data-portability/service";
import { audit } from "@/server/domain/services/audit";
import { authorizePortabilitySession } from "@/modules/data-portability/authorization";
import { publicPortabilityError } from "@/modules/data-portability/public-error";

export const runtime = "nodejs";
export const maxDuration = 300;
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const fields = z.object({
  action: z.enum(["export", "preview", "import"]),
  passphrase: z.string().min(16).max(1024),
  organizationId: z.uuid().optional(),
  confirmation: z.string().max(200).optional(),
});

async function boundedForm(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_ARCHIVE_BYTES + 64 * 1024) {
        await reader.cancel();
        throw new Error("Upload limit exceeded");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Response(Buffer.concat(chunks), {
    headers: { "Content-Type": request.headers.get("content-type") ?? "" },
  }).formData();
}
export async function POST(request: Request) {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;
  let connection: ReturnType<typeof connectRuntimePortability> | undefined;
  try {
    // Cookie-authenticated mutations must originate from this instance, not an arbitrary website.
    if (request.headers.get("origin") !== new URL(env.BETTER_AUTH_URL).origin)
      return Response.json(
        { error: "Forbidden origin" },
        { status: 403, headers },
      );
    await assertPortabilityMaintenance();
    const form = await boundedForm(request);
    const input = fields.parse({
      action: form.get("action"),
      passphrase: form.get("passphrase"),
      organizationId: form.get("organizationId") || undefined,
      confirmation: form.get("confirmation") || undefined,
    });
    connection = connectRuntimePortability();
    connection.context.authorize = authorizePortabilitySession(
      auth.session.user.id,
      auth.session.session.id,
    );
    if (input.action === "export") {
      const snapshot = await createSnapshot(
        connection.context,
        input.organizationId
          ? { type: "organization", organizationId: input.organizationId }
          : { type: "instance" },
      );
      const archive = await sealSnapshot(snapshot, input.passphrase);
      await audit.emit({
        actorPrincipalType: "user",
        actorPrincipalId: auth.session.user.id,
        action: "data.exported",
        resourceType: "organization",
        resourceId: input.organizationId ?? undefined,
        outcome: "success",
      });
      return new Response(new Uint8Array(archive), {
        headers: {
          ...headers,
          "Content-Type": "application/octet-stream",
          "Content-Disposition": 'attachment; filename="maiah-data.maiah"',
        },
      });
    }
    const file = form.get("archive");
    if (!(file instanceof File) || file.size > MAX_ARCHIVE_BYTES)
      throw new Error("Invalid archive");
    const bytes = Buffer.from(await file.arrayBuffer());
    const archiveDigest = digest(bytes);
    if (
      input.action === "import" &&
      !verifyConfirmation(
        env.APP_ENCRYPTION_KEY,
        auth.session.user.id,
        archiveDigest,
        input.confirmation ?? "",
      )
    )
      return Response.json(
        { error: "Preview expired or archive changed; validate it again" },
        { status: 409, headers },
      );
    const snapshot = await openSnapshot(bytes, input.passphrase);
    if (input.organizationId && snapshot.scope.type !== "organization")
      return Response.json(
        { error: "Use platform settings to import an instance archive" },
        { status: 400, headers },
      );
    const result = await restoreSnapshot(
      connection.context,
      snapshot,
      input.action === "preview",
    );
    // Audit is separate from the imported historical audit trail. Never report a committed import as failed.
    if (input.action === "import") {
      await audit
        .emit({
          actorPrincipalType: "user",
          actorPrincipalId: auth.session.user.id,
          action: "data.imported",
          outcome: "success",
          metadata: {
            archiveDigest,
            rows: result.rows,
            objects: result.objects,
          },
        })
        .catch(() => undefined);
    }
    return Response.json(
      {
        ...result,
        confirmation:
          input.action === "preview"
            ? signConfirmation(
                env.APP_ENCRYPTION_KEY,
                auth.session.user.id,
                archiveDigest,
              )
            : undefined,
      },
      { headers },
    );
  } catch (error) {
    const failure = publicPortabilityError(error);
    return Response.json(
      { error: failure.message },
      { status: failure.status, headers },
    );
  } finally {
    await connection?.close();
  }
}
