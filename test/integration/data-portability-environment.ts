// Dedicated disposable infrastructure only: never fall back to the application DB.
export const portabilityTestDatabaseUrl =
  process.env.PORTABILITY_TEST_DATABASE_URL ??
  "postgres://postgres:deo62-local-only@127.0.0.1:15462/postgres";

export const portabilityTestStorage = {
  endpoint:
    process.env.PORTABILITY_TEST_STORAGE_ENDPOINT ?? "http://127.0.0.1:19462",
  region: "us-east-1",
  accessKeyId:
    process.env.PORTABILITY_TEST_STORAGE_ACCESS_KEY_ID ?? "deo62local",
  secretAccessKey:
    process.env.PORTABILITY_TEST_STORAGE_SECRET_ACCESS_KEY ??
    "deo62-local-storage-only",
  forcePathStyle: true,
};
