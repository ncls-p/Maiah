import type { ChatTodoList } from "@/modules/chat/todo-list";

/** expanded = details open, collapsed = header only, hidden = chip to restore */
export type TodoDockPresentation = "expanded" | "collapsed" | "hidden";

const presentationByPlanKey = new Map<string, TodoDockPresentation>();

export function chatTodoPlanKey(todoList: ChatTodoList) {
  return `${todoList.title}::${todoList.items.map((item) => item.id).join("|")}`;
}

export function readTodoDockPresentation(planKey: string): TodoDockPresentation {
  return presentationByPlanKey.get(planKey) ?? "expanded";
}

export function writeTodoDockPresentation(
  planKey: string,
  presentation: TodoDockPresentation,
) {
  presentationByPlanKey.set(planKey, presentation);
}

/** Test helper — clears remembered presentations between cases. */
export function resetTodoDockPresentations() {
  presentationByPlanKey.clear();
}
