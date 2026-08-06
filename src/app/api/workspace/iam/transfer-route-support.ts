import { IamOperationError } from "@/modules/iam/use-cases";
import { NextResponse } from "next/server";

export function expectedIamError(error: unknown) {
  if (error instanceof IamOperationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}
