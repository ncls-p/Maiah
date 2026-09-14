import { NextRequest } from "next/server";
import { handleAnalytics } from "@/modules/analytics/route";
export function GET(req: NextRequest) {
  return handleAnalytics(req, "usage");
}
