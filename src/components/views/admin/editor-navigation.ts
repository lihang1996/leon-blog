/** Pure traversal bookkeeping: no sentinel entries, state replacement, or forward-stack truncation. */
export function createTraversalGuard(initialIndex: number) {
  let acceptedIndex = initialIndex;
  let restoring = false;
  return {
    committed(index: number) {
      if (!restoring) acceptedIndex = index;
    },
    visit(index: number, shouldBlock: boolean, confirmLeave: () => boolean) {
      if (restoring) {
        if (index === acceptedIndex) restoring = false;
        return { suppress: true, delta: acceptedIndex - index };
      }
      if (index === acceptedIndex || !shouldBlock || confirmLeave()) {
        acceptedIndex = index;
        return { suppress: false, delta: 0 };
      }
      restoring = true;
      return { suppress: true, delta: acceptedIndex - index };
    },
  };
}

export type NavigationEntries = EventTarget & { currentEntry: { index: number } | null };

/** Browser port kept small so traversal and listener cleanup can be tested without a React mock. */
export function attachTraversalGuard(
  events: EventTarget,
  navigation: NavigationEntries,
  go: (delta: number) => void,
  shouldBlock: () => boolean,
  confirmLeave: () => boolean,
) {
  const guard = createTraversalGuard(navigation.currentEntry!.index);
  const entryChange = (event: Event) => {
    if ((event as Event & { navigationType?: string }).navigationType !== "traverse" && navigation.currentEntry) {
      guard.committed(navigation.currentEntry.index);
    }
  };
  const popState = (event: Event) => {
    if (!navigation.currentEntry) return;
    const result = guard.visit(navigation.currentEntry.index, shouldBlock(), confirmLeave);
    if (result.suppress) {
      // Capture precedes Next's bubble listener; the reversal must also be hidden from it.
      event.stopImmediatePropagation();
      if (result.delta) go(result.delta);
    }
  };
  events.addEventListener("popstate", popState, true);
  navigation.addEventListener("currententrychange", entryChange);
  return () => {
    events.removeEventListener("popstate", popState, true);
    navigation.removeEventListener("currententrychange", entryChange);
  };
}

export function isLeavingLink(
  link: { href: string; target: string; download: boolean },
  currentUrl: string,
  event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.download || (link.target && link.target !== "_self")) return false;
  const destination = new URL(link.href, currentUrl);
  const current = new URL(currentUrl);
  if (!["http:", "https:"].includes(destination.protocol)) return false;
  return destination.origin !== current.origin || destination.pathname !== current.pathname || destination.search !== current.search;
}
