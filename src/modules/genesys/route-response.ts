import { ZodError } from "zod";
import { GenesysError } from "./contracts";
export async function genesysResponse(action: () => Promise<unknown>) {
  try {
    return Response.json(await action());
  } catch (error) {
    if (error instanceof GenesysError)
      return Response.json(
        { error: error.code, code: error.code },
        { status: error.status },
      );
    if (error instanceof ZodError || error instanceof SyntaxError)
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    return Response.json({ error: "GENESYS_INTERNAL_ERROR" }, { status: 500 });
  }
}
