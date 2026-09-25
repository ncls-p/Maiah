import { readFile, stat, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  connectPortability,
  connectionSchema,
} from "../src/modules/data-portability/context";
import {
  MAX_ARCHIVE_BYTES,
  openSnapshot,
  sealSnapshot,
  summarize,
  type Scope,
} from "../src/modules/data-portability/archive";
import {
  createSnapshot,
  restoreSnapshot,
} from "../src/modules/data-portability/service";

async function readConnection(file: string) {
  const info = await stat(file);
  if ((info.mode & 0o077) !== 0)
    throw new Error("Connection files contain secrets and must have mode 0600");
  const text = await readFile(file, "utf8");
  try {
    return connectionSchema.parse(JSON.parse(text));
  } catch {
    throw new Error("Invalid connection configuration JSON");
  }
}
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      connection: { type: "string" },
      target: { type: "string" },
      file: { type: "string" },
      organization: { type: "string" },
      confirm: { type: "boolean" },
      maintenance: { type: "boolean" },
    },
  });
  const command = z
    .enum(["export", "inspect", "import", "transfer"])
    .parse(positionals[0]);
  const password = process.env.MAIAH_ARCHIVE_PASSPHRASE;
  if (!password || password.length < 16)
    throw new Error(
      "Set MAIAH_ARCHIVE_PASSPHRASE (at least 16 characters); never pass it on the command line",
    );
  if (command === "inspect") {
    if (!values.file || (await stat(values.file)).size > MAX_ARCHIVE_BYTES)
      throw new Error("Missing or oversized archive");
    console.log(
      JSON.stringify(
        summarize(await openSnapshot(await readFile(values.file), password)),
        null,
        2,
      ),
    );
    return;
  }
  if (!values.maintenance || !values.connection)
    throw new Error(
      "Pause application writers/workers, then pass --maintenance and --connection <private.json>",
    );
  const source = connectPortability(await readConnection(values.connection));
  let target: ReturnType<typeof connectPortability> | undefined;
  try {
    if (command === "import") {
      if (!values.file || (await stat(values.file)).size > MAX_ARCHIVE_BYTES)
        throw new Error("Missing or oversized archive");
      const snapshot = await openSnapshot(
        await readFile(values.file),
        password,
      );
      const result = await restoreSnapshot(
        source.context,
        snapshot,
        !values.confirm,
      );
      console.log(JSON.stringify(result, null, 2));
    } else {
      const scope: Scope = values.organization
        ? {
            type: "organization",
            organizationId: z.uuid().parse(values.organization),
          }
        : { type: "instance" };
      const snapshot = await createSnapshot(source.context, scope);
      const archive = await sealSnapshot(snapshot, password);
      if (command === "export") {
        if (!values.file) throw new Error("Pass --file <archive.maiah>");
        await writeFile(values.file, archive, { mode: 0o600, flag: "wx" });
        console.log(JSON.stringify(summarize(snapshot), null, 2));
      } else {
        if (!values.target)
          throw new Error("Pass --target <private-destination.json>");
        target = connectPortability(await readConnection(values.target));
        // The same encrypted format/validation is used by file and direct transfers.
        const portable = await openSnapshot(archive, password);
        console.log(
          JSON.stringify(
            await restoreSnapshot(target.context, portable, !values.confirm),
            null,
            2,
          ),
        );
      }
    }
  } finally {
    await target?.close();
    await source.close();
  }
}
main().catch((error) => {
  // Do not dump configurations, SQL details, rows or decrypted values.
  console.error(
    error instanceof z.ZodError
      ? "Invalid connection configuration or archive"
      : error instanceof Error
        ? error.message
        : "Migration failed",
  );
  process.exitCode = 1;
});
