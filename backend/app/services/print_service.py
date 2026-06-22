"""伺服器端列印:把 PDF 送到 CUPS 佇列。

為什麼走伺服器端(前端只發指令):
- 平板/手機只要連得到網頁即可,不必裝驅動、不依賴特定裝置 → 最穩定。
- 印表機掛在 NAS(CUPS)旁,集中管理一般機與點陣機兩個佇列。

實作用 `lp` 指令(CUPS 標準 CLI),不需編譯 pycups。
CUPS 是 Linux 專屬,Windows 本機沒有 → 會回 cups_unavailable,屬預期。
"""

import shutil
import subprocess
from pathlib import Path


class PrintError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def print_pdf(path: Path, queue: str, media: str | None = None) -> str:
    """送印,回傳 CUPS job 字串。失敗拋 PrintError。

    media:CUPS 紙張尺寸名稱(如 Custom.210x140mm)。有指定時明確告知 CUPS 頁面尺寸,
    避免它用印表機預設(通常 A4 直式)去套、自動旋轉/縮放,造成「長寬顛倒」。
    """
    if shutil.which("lp") is None:
        raise PrintError("cups_unavailable", "找不到 CUPS 的 lp 指令(需在已裝 CUPS 的主機/容器執行)")
    if not path.exists():
        raise PrintError("file_missing", f"找不到要列印的檔案:{path}")
    cmd = ["lp", "-d", queue]
    if media:
        # 告訴 CUPS 實際紙張尺寸 + 不要自動縮放(以實際大小印,不旋轉)
        cmd += ["-o", f"media={media}", "-o", "fit-to-page=false"]
    cmd.append(str(path))
    try:
        result = subprocess.run(
            cmd,
            capture_output=True, text=True, timeout=30,
        )
    except Exception as e:  # pragma: no cover
        raise PrintError("lp_failed", f"呼叫 lp 失敗:{e}")
    if result.returncode != 0:
        raise PrintError("lp_failed", result.stderr.strip() or "lp 回傳非零")
    return result.stdout.strip()
