/**
 * InlineReadPanel — dismissible in-flow panel for displaying file content inline
 * within the Milestone view.
 *
 * Rendered below SliceAccordion when a view_plan/view_task/view_diff/view_uat_results
 * action is triggered. Uses in-flow layout (not fixed/absolute) to avoid z-index conflicts.
 */

interface InlineReadPanelProps {
  isOpen: boolean;
  title: string;
  content: string;
  isLoading: boolean;
  onClose: () => void;
}

export function InlineReadPanel({ isOpen, title, content, isLoading, onClose }: InlineReadPanelProps) {
  if (!isOpen) return null;

  return (
    <div
      data-testid="inline-read-panel"
      className="mt-4 rounded-lg border border-[#1E2D3D] bg-[#0F1419] overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1E2D3D] bg-[#131C2B]">
        <span className="font-mono text-sm text-slate-200 font-bold">{title}</span>
        <button
          aria-label="Close panel"
          onClick={onClose}
          className="ml-2 flex items-center justify-center w-6 h-6 rounded hover:bg-[#1E2D3D] text-slate-400 hover:text-slate-200 transition-colors font-mono text-base leading-none"
        >
          ×
        </button>
      </div>
      <div className="overflow-auto max-h-[40vh] p-4">
        {isLoading ? (
          <span className="font-mono text-xs text-slate-500">Loading...</span>
        ) : (
          <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap break-words">{content}</pre>
        )}
      </div>
    </div>
  );
}
