import { logHandledWarning } from "@/lib/logger";
import { db } from "@/server/infrastructure/db";
import { users } from "@/server/infrastructure/db/schema-tables";
import { NextResponse } from "next/server";

export async function GET() {
  const result: Record<string, string> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "0.1.0",
    deployment: process.env.OTEL_SERVICE_VERSION || "local",
  };

  try {
    await db.select().from(users).limit(0);
    result.database = "connected";
  } catch (error) {
    result.status = "degraded";
    result.database = "disconnected";
    logHandledWarning("Health check degraded", {
      database: "disconnected",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json(result, {
    status: result.status === "ok" ? 200 : 503,
  });
}
