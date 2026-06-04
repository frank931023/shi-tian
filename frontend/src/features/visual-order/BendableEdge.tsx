// 可折彎的自訂連線:中點有一個可拖曳的控制點(單一 waypoint)。
// 拖控制點 → 線在該點轉一個彎;不拖則預設走中點(等同直線)。
// waypoint 座標存在 edge.data.wp(flow 座標)。
import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";

interface WP { x: number; y: number; }

export default function BendableEdge({
  id, sourceX, sourceY, targetX, targetY, data,
}: EdgeProps) {
  const { screenToFlowPosition, setEdges } = useReactFlow();

  const wp: WP = (data?.wp as WP | undefined) ?? {
    x: (sourceX + targetX) / 2,
    y: (sourceY + targetY) / 2,
  };

  // 兩段折線:source → waypoint → target(在 waypoint 處轉彎)
  const path = `M ${sourceX},${sourceY} L ${wp.x},${wp.y} L ${targetX},${targetY}`;

  const startDragWaypoint = (e: React.PointerEvent) => {
    e.stopPropagation();
    const move = (ev: PointerEvent) => {
      const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      setEdges((es) =>
        es.map((edge) => (edge.id === id ? { ...edge, data: { ...edge.data, wp: { x: p.x, y: p.y } } } : edge)),
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <>
      <BaseEdge id={id} path={path} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)`,
            pointerEvents: "all",
          }}
          onPointerDown={startDragWaypoint}
          title="拖曳調整線的轉折"
        >
          <div className="h-3 w-3 cursor-move rounded-full border-2 border-brand bg-white opacity-50 transition hover:scale-125 hover:opacity-100" />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
