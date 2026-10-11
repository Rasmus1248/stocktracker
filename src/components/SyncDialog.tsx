import { useEffect, useRef, useState } from "react";
import { syncLink } from "../lib/syncCode";
import type { SyncState } from "../lib/usePortfolios";

export const SYNC_LABEL: Record<SyncState["status"], string> = {
  connecting: "Connecting…",
  saving: "Saving…",
  synced: "Synced",
  offline: "Offline — changes saved on this device",
  unavailable: "Sync not set up",
};

interface Props {
  sync: SyncState & { switchCode: (code: string) => Promise<string | null>; retry: () => void };
  onClose: () => void;
}

export function SyncDialog({ sync, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState<"" | "link" | "code">("");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => ref.current?.showModal(), []);

  const link = syncLink(sync.code);
  const copy = async (what: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? link : sync.code);
      setCopied(what);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* clipboard blocked; the text is selectable */
    }
  };

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <div className="dialog-body">
        <header className="row between">
          <h2>Use your portfolios on other devices</h2>
          <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <p className={`sync-status ${sync.status}`}>
          <span className="dot" aria-hidden /> {SYNC_LABEL[sync.status]}
          {(sync.status === "offline" || sync.status === "unavailable") && sync.error && <span className="muted small"> — {sync.error}</span>}
          {sync.status === "offline" && <button className="link small" onClick={sync.retry}>Retry</button>}
        </p>

        <section>
          <h3>Your sync code</h3>
          <p className="muted small">
            Open this link on your phone, tablet or another computer to see the same portfolios there. Changes save automatically
            on every device. <strong>Keep it private</strong>: anyone with the code can view and edit your portfolios.
          </p>
          <div className="code-box">
            <code>{sync.code}</code>
            <button className="small" onClick={() => copy("code")}>{copied === "code" ? "Copied" : "Copy code"}</button>
            <button className="small primary" onClick={() => copy("link")}>{copied === "link" ? "Copied" : "Copy link"}</button>
          </div>
        </section>

        <section>
          <h3>Already have a code?</h3>
          <p className="muted small">Enter the code from your other device. The portfolios on this device will be replaced by the ones saved under that code.</p>
          <form
            className="row"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const err = await sync.switchCode(input);
              setBusy(false);
              setError(err);
              if (!err) onClose();
            }}
          >
            <input className="grow" placeholder="xxxx-xxxx-xxxx-xxxx-xxxx" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Sync code" />
            <button type="submit" disabled={!input.trim() || busy}>{busy ? "Loading…" : "Load"}</button>
          </form>
          {error && <p className="error small">{error}</p>}
        </section>
      </div>
    </dialog>
  );
}
