import { z } from "zod";
const fileSchema = z.object({
  field: z.enum(["file", "files"]).default("file"),
  name: z.string().min(1).max(255),
  contentType: z.string().max(150).default("application/octet-stream"),
  base64: z
    .string()
    .max(240_000)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
export const uploadSchema = z.object({
  files: z.array(fileSchema).min(1).max(10),
});
export function multipartBody(body: Record<string, unknown>) {
  const { files } = uploadSchema.parse(body);
  const form = new FormData();
  let size = 0;
  for (const file of files) {
    const data = Buffer.from(file.base64, "base64");
    size += data.length;
    if (size > 180_000)
      throw new Error(
        "MCP upload limit is 180 KB; use the application's resumable upload for larger files",
      );
    form.append(
      file.field,
      new Blob([data], { type: file.contentType }),
      file.name,
    );
  }
  for (const [key, value] of Object.entries(body)) {
    if (key === "files" || value === undefined) continue;
    if (!["string", "number", "boolean"].includes(typeof value))
      throw new Error(`Multipart field ${key} must be a scalar`);
    form.append(key, String(value));
  }
  return form;
}
