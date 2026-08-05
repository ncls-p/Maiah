import { commonSchemasPart1 } from "./builtin-tool-json-schema.common-schemas.part-1";
import { commonSchemasPart2 } from "./builtin-tool-json-schema.common-schemas.part-2";
import { commonSchemasPart3 } from "./builtin-tool-json-schema.common-schemas.part-3";
import { commonSchemasPart4 } from "./builtin-tool-json-schema.common-schemas.part-4";

export const commonSchemas: Record<string, unknown> = {
  ...commonSchemasPart1,
  ...commonSchemasPart2,
  ...commonSchemasPart3,
  ...commonSchemasPart4,
};
