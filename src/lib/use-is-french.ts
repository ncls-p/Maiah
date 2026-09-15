"use client";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
const snapshot = () => window.location.pathname.startsWith("/fr");
const serverSnapshot = () => false;
export function useIsFrench() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
