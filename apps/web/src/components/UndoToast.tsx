import { useJarvis } from "../store/JarvisProvider";

export function UndoToast() {
  const { toast, undo, hideToast } = useJarvis();
  if (!toast) return null;

  return (
    <div className="toast on" role="status">
      <svg className="ring" viewBox="0 0 14 14" aria-hidden>
        <circle cx="7" cy="7" r="6" />
        <circle className="p" cx="7" cy="7" r="6" transform="rotate(-90 7 7)" />
      </svg>
      <span>
        <b>Approved.</b> Running live now.
      </span>
      <button
        type="button"
        onClick={() => {
          undo(toast.goalId);
          hideToast();
        }}
      >
        Undo
      </button>
    </div>
  );
}
