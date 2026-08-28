export const CHAT_INTERFACE_MODE = "chat";
export const CODING_INTERFACE_MODE = "coding";

export type InterfaceMode =
  | typeof CHAT_INTERFACE_MODE
  | typeof CODING_INTERFACE_MODE;

export function shouldAutoActivateCoding(
  userSelectedMode: InterfaceMode | null,
) {
  return userSelectedMode !== CHAT_INTERFACE_MODE;
}
