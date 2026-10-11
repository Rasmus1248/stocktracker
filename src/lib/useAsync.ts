import { useEffect, useState } from "react";

/** Runs `load` whenever `key` changes, optionally re-running every `refreshMs`. */
export function useAsync<T>(key: string | null, load: () => Promise<T>, refreshMs?: number) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: key != null });

  useEffect(() => {
    if (key == null) {
      setState({ loading: false });
      return;
    }
    let alive = true;
    const run = () => {
      setState((s) => ({ ...s, loading: true }));
      load().then(
        (data) => alive && setState({ data, loading: false }),
        (e: Error) => alive && setState((s) => ({ data: s.data, error: e.message, loading: false })),
      );
    };
    run();
    const timer = refreshMs ? setInterval(run, refreshMs) : undefined;
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
