import { z } from "zod";

export const invocationParamsSchema = z.object({ invocationId: z.uuid() });
