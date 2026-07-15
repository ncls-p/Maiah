import { PageLoading } from "@/components/page-loading";

export default function WorkspaceLoading() {
  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-6xl items-start justify-center px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <PageLoading label="Loading page" className="w-full" />
    </div>
  );
}
