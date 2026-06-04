"""統一 API 回傳格式(CLAUDE.md §6 / 文件 §4)。

成功:{ "data": <任何資料>, "error": null }
失敗:{ "data": null, "error": { "code": "...", "message": "..." } }

為什麼統一格式:前端只要寫一套解析邏輯,錯誤處理也一致,長期維護成本低。
"""

from flask import jsonify


def ok(data=None, status: int = 200):
    """回傳成功結果。"""
    return jsonify({"data": data, "error": None}), status


def err(code: str, message: str, status: int = 400):
    """回傳錯誤結果。code 給程式判斷、message 給人看。"""
    return jsonify({"data": None, "error": {"code": code, "message": message}}), status
