export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
