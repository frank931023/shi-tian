// 建單入口選擇頁:左=表單式、右=拖曳式。
// 按側欄「建單」會進到這裡,讓使用者先選要用哪種方式建單。
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui";

export default function BuildChooserPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-center text-2xl font-bold sm:text-3xl">要怎麼建單?</h1>
      <p className="text-center text-slate-500">兩種方式建出的單完全一樣,選你順手的。</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* 左:表單式 */}
        <button onClick={() => navigate("/orders/new")} className="text-left">
          <Card className="flex h-full flex-col items-center gap-3 border-2 border-transparent p-8 text-center transition hover:border-brand hover:shadow-md">
            <span className="text-6xl">📝</span>
            <h2 className="text-xl font-bold">表單式建立</h2>
            <p className="text-slate-500">傳統表單、逐行輸入,鍵盤快速、手機平板都好用。適合大量建單。</p>
          </Card>
        </button>

        {/* 右:拖曳式 */}
        <button onClick={() => navigate("/orders/visual")} className="text-left">
          <Card className="flex h-full flex-col items-center gap-3 border-2 border-transparent p-8 text-center transition hover:border-brand hover:shadow-md">
            <span className="text-6xl">🧩</span>
            <h2 className="text-xl font-bold">拖曳式建立</h2>
            <p className="text-slate-500">視覺化節點畫布,拖拉元件組單、即時預覽。適合桌機操作。</p>
          </Card>
        </button>
      </div>
    </div>
  );
}
