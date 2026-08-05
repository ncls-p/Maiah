"use client";

export type WorkflowAgenticActivity = {
  id: string;
  toolName: string;
  status: "running" | "done" | "error";
};
