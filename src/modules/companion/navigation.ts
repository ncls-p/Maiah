import { APPLICATION_PAGES } from "./generated-pages";

export function isApplicationPage(path: string) {
  if (!/^\/(en|fr)\//.test(path) || /[\\?#%]/.test(path) || path.includes(".."))
    return false;
  const parts = path.split("/").slice(2);
  return APPLICATION_PAGES.some((page) => {
    const expected = page.split("/").slice(1);
    return (
      expected.length === parts.length &&
      expected.every((part, index) =>
        part.startsWith("[")
          ? /^[a-zA-Z0-9_-]+$/.test(parts[index])
          : part === parts[index],
      )
    );
  });
}
