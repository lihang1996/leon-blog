"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { attachTraversalGuard, isLeavingLink, type NavigationEntries } from "./editor-navigation";
import { isLogoutLeaveArmed } from "./logout-guard";

const LEAVE_MESSAGE = "有尚未保存的修改或未确认的操作，确定离开当前页面吗？";

export function useEditorLeaveGuard(shouldBlock: boolean) {
  const blockRef = useRef(shouldBlock);
  const [historyGuardAvailable, setHistoryGuardAvailable] = useState(true);
  useLayoutEffect(() => { blockRef.current = shouldBlock; }, [shouldBlock]);
  // FR-20.3: after the user confirms the logout decision, the leaving
  // navigation itself must not raise the SAME unsaved confirmation again.
  const shouldBlockNow = () => blockRef.current && !isLogoutLeaveArmed();

  useLayoutEffect(() => {
    const navigation = (window as Window & { navigation?: NavigationEntries }).navigation;
    const detachTraversal = navigation?.currentEntry && navigation.currentEntry.index >= 0
      ? attachTraversalGuard(window, navigation, (delta) => window.history.go(delta), shouldBlockNow, () => window.confirm(LEAVE_MESSAGE))
      : null;
    let active = true;
    queueMicrotask(() => { if (active) setHistoryGuardAvailable(!!detachTraversal); });

    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!shouldBlockNow()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      if (!shouldBlockNow() || event.defaultPrevented) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || !isLeavingLink({ href: link.href, target: link.target, download: link.hasAttribute("download") }, window.location.href, event)) return;
      // External document navigations use the native beforeunload confirmation.
      if (new URL(link.href).origin !== window.location.origin) return;
      if (!window.confirm(LEAVE_MESSAGE)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      active = false;
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
      detachTraversal?.();
      // History belongs to the browser/Next. Never pop, replace, or clear it in cleanup.
    };
  }, []);

  return historyGuardAvailable;
}
