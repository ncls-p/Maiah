import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const destinationDirectory = path.join(process.cwd(), "public", "vendor");
const destination = path.join(destinationDirectory, "swagger-ui-bundle.js");
const source = require.resolve("swagger-ui-dist/swagger-ui-bundle.js");

await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, destination);
console.log("Prepared local Swagger UI browser asset.");
