"""聊天機器人(Text-to-SQL agent)套件。

子模組:
- security:SQL 安全驗證(純 Python,多層防護的最後一道,也是可單元測試的核心)
- db:唯讀查詢執行器(READ ONLY 交易 + 逾時 + 列數上限)
- memory:對話記憶(每對話滑動視窗,in-memory)
- agent:LangGraph 流程(惰性匯入;沒裝套件 / 沒 API key 時優雅停用)

設計原則見 docs/chatbot.md。
"""
