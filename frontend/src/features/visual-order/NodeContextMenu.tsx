// 節點右鍵選單:刪除 / 複製。固定定位在滑鼠點擊處。
interface Props {
  x: number;
  y: number;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function NodeContextMenu({ x, y, onCopy, onDelete, onClose }: Props) {
  return (
    <div
      className="fixed z-50 w-32 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
      style={{ left: x, top: y }}
      onMouseLeave={onClose}
    >
      <button
        className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-100"
        onClick={() => { onCopy(); onClose(); }}
      >
        複製
      </button>
      <button
        className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
        onClick={() => { onDelete(); onClose(); }}
      >
        刪除
      </button>
    </div>
  );
}
