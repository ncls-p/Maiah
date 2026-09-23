import { z } from "zod";
import { env } from "@/lib/env";
import { requireAdminApiSession } from "@/modules/admin/auth";
import {
  digest,
  openSnapshot,
  sealSnapshot,
} from "@/modules/data-portability/archive";
import {
  IMPORT_ACKNOWLEDGEMENT,
  signConfirmation,
  verifyConfirmation,
} from "@/modules/data-portability/confirmation";
import { readPortabilityRequest } from "@/modules/data-portability/request";
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
const fields = z
  .object({
    action: z.enum(["export", "preview", "import"]),
    passphrase: z.string().min(16).max(1024),
    organizationId: z.uuid().optional(),
    confirmation: z.string().max(200).optional(),
    acknowledgement: z.string().max(20).optional(),
  })
  .strict();
const auditActions = {
  export: "data.exported",
  preview: "data.import_previewed",
  import: "data.imported",
} as const;

export async function POST(request: Request) {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;
  let connection: ReturnType<typeof connectRuntimePortability> | undefined;
  let action: keyof typeof auditActions | undefined;
  let organizationId: string | undefined;
  let archiveDigest: string | undefined;
  // Every administrator attempt is audited, never with archive content or passphrases.
  const record = (
    outcome: "success" | "denied" | "failed",
    metadata: Record<string, unknown> = {},
  ) =>
    audit
      .emit({
        actorPrincipalType: "user",
        actorPrincipalId: auth.session.user.id,
        action: action ? auditActions[action] : "data.portability_rejected",
        resourceType: organizationId ? "organization" : "instance",
        resourceId: organizationId,
        organizationId,
        outcome,
        metadata: archiveDigest ? { archiveDigest, ...metadata } : metadata,
      })
      .catch(() => undefined);
  const reject = async (status: number, error: string) => {
    await record(status === 403 ? "denied" : "failed", { error });
    return Response.json({ error }, { status, headers });
  };
  try {
    // Cookie-authenticated mutations must originate from this instance, not an arbitrary website.
    if (request.headers.get("origin") !== new URL(env.BETTER_AUTH_URL).origin)
      return await reject(403, "Forbidden origin");
    await assertPortabilityMaintenance();
    const body = await readPortabilityRequest(request);
    const input = fields.parse(body.fields);
    action = input.action;
    organizationId = input.organizationId;
    const binding = {
      userId: auth.session.user.id,
      sessionId: auth.session.session.id,
      organizationId,
    };
    connection = connectRuntimePortability();
    connection.context.authorize = authorizePortabilitySession(
      binding.userId,
      binding.sessionId,
    );
    if (input.action === "export") {
      const snapshot = await createSnapshot(
        connection.context,
        organizationId
          ? { type: "organization", organizationId }
          : { type: "instance" },
      );
      const archive = await sealSnapshot(snapshot, input.passphrase);
      await record("success");
      return new Response(
        new Uint8Array(
          archive.buffer as ArrayBuffer,
          archive.byteOffset,
          archive.byteLength,
        ),
        {
          headers: {
            ...headers,
            "Content-Type": "application/octet-stream",
            "Content-Disposition": 'attachment; filename="maiah-data.maiah"',
          },
        },
      );
    }
    if (!body.archive) throw new Error("Invalid archive");
    archiveDigest = digest(body.archive);
    if (input.action === "import") {
      if (input.acknowledgement !== IMPORT_ACKNOWLEDGEMENT)
        return await reject(400, "Type IMPORT to confirm the restoration");
      if (
        !verifyConfirmation(
          env.APP_ENCRYPTION_KEY,
          { ...binding, archiveDigest },
          input.confirmation ?? "",
        )
      )
        return await reject(
          409,
          "Preview expired or archive changed; validate it again",
        );
    }
    const snapshot = await openSnapshot(body.archive, input.passphrase);
    // An organization panel only accepts organization archives. They are added under
    // their own identifier: the organization being viewed is never merged or replaced.
    if (organizationId && snapshot.scope.type !== "organization")
      return await reject(
        400,
        "Use platform settings to import an instance archive",
      );
    const result = await restoreSnapshot(
      connection.context,
      snapshot,
      input.action === "preview",
    );
    // Audit is separate from the imported historical audit trail. Never report a committed import as failed.
    await record("success", { rows: result.rows, objects: result.objects });
    return Response.json(
      {
        ...result,
        confirmation:
          input.action === "preview"
            ? signConfirmation(env.APP_ENCRYPTION_KEY, {
                ...binding,
                archiveDigest,
              })
            : undefined,
      },
      { headers },
    );
  } catch (error) {
    const failure = publicPortabilityError(error);
    return await reject(failure.status, failure.message);
  } finally {
    await connection?.close();
  }
}
