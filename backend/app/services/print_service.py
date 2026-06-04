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


def print_pdf(path: Path, queue: str) -> str:
    """送印,回傳 CUPS job 字串。失敗拋 PrintError。"""
    if shutil.which("lp") is None:
        raise PrintError("cups_unavailable", "找不到 CUPS 的 lp 指令(需在已裝 CUPS 的主機/容器執行)")
    if not path.exists():
        raise PrintError("file_missing", f"找不到要列印的檔案:{path}")
    try:
        result = subprocess.run(
            ["lp", "-d", queue, str(path)],
            capture_output=True, text=True, timeout=30,
        )
    except Exception as e:  # pragma: no cover
        raise PrintError("lp_failed", f"呼叫 lp 失敗:{e}")
    if result.returncode != 0:
        raise PrintError("lp_failed", result.stderr.strip() or "lp 回傳非零")
    return result.stdout.strip()
