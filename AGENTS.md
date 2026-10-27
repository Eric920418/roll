# Git 工作方式

- 依使用者要求，本工作區直接在 `main` 開發、提交並推送 `origin/main`；除非使用者明確要求，不建立新分支或分支工作樹。
- 先同步並保留遠端 main 的修改，再合併本機工作；不得用強制推送、重設或整份覆蓋來丟棄其他既有改動。
- 每批檔案修改同步更新唯一交付文件 `README.md`，不新增其他說明文件。

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
