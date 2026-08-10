import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  WorkflowConflictError,
  WorkflowNotFoundError,
  WorkflowQueueError,
} from "@/modules/workflows/use-cases";

export function workflowErrorResponse(error: unknown) {
  if (error instanceof WorkflowNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof WorkflowConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof WorkflowQueueError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid workflow definition", details: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof Error && error.message.includes("Workflow")) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return null;
}
