import type { Metadata } from "next";
import "swagger-ui-dist/swagger-ui.css";

import { SwaggerDocs } from "@/app/api/docs/swagger-docs";

export const metadata: Metadata = {
  title: "Maiah API documentation",
  description: "Interactive OpenAPI documentation for the Maiah API.",
};

export default function ApiDocsPage() {
  return <SwaggerDocs />;
}
