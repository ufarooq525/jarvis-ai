import { useJarvis } from "../store/JarvisProvider";

export function LiveConfirmDialog() {
  const { liveConfirmOpen, stayShadow, confirmLiveMode } = useJarvis();
  if (!liveConfirmOpen) return null;

  return (
    <>
      <div className="scrim on" onClick={stayShadow} />
      <div className="dlg on" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
        <div className="dlg-b">
          <h2 id="dlg-t">Switch the default to Live?</h2>
          <p>
            New plans will still be shown to you and still need approval. What changes is that
            approving them will actually run.
          </p>
          <div className="dlg-warn">
            Control API is not connected, so approved runs will queue until it comes up. You can
            switch back at any time.
          </div>
        </div>
        <div className="dlg-f">
          <button type="button" className="btn sec" onClick={stayShadow}>
            Stay in Shadow
          </button>
          <button type="button" className="btn" onClick={confirmLiveMode}>
            Switch to Live
          </button>
        </div>
      </div>
    </>
  );
}
