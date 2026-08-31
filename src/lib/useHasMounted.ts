import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

/**
 * True once the component has hydrated on the client. Using useSyncExternalStore (rather than a
 * useState+useEffect pair) keeps the first client render identical to the server-rendered HTML,
 * so there's no hydration mismatch, and React re-renders automatically right after hydration.
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
