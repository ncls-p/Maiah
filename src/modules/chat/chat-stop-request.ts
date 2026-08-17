import { z } from "zod";

export const chatStopRequestSchema = z
  .object({
    messageId: z.uuid().optional(),
    generationId: z.uuid().optional(),
  })
  .refine((value) => Boolean(value.messageId) === Boolean(value.generationId), {
    message: "messageId and generationId must be provided together",
  });
