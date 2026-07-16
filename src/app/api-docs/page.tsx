import { permanentRedirect } from "next/navigation";

export default function LegacyApiDocsPage() {
  permanentRedirect("/api/docs");
}
