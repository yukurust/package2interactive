# Agent Guidelines & Rules

## コミットルール

`main` に直接コミットしない。ブランチを切り、base が `main` のプルリクエストを作る。ユーザーがマージを頼むまで、マージしない。作業ブランチ同士でマージして完了にしない。force-push しない。開いたままの dirty な `main` は触らず、worktree を使う。

スカッシュマージのあと、同じ変更が元のコミットのままブランチに残ると衝突する。そのときは、あとから載った画面（メニュー、News）を残す。

エージェントがコミットするときは、作者は人のままにする。メッセージの末尾に、使ったモデル名と、そのツールの共著者を一つだけ置く。本文とトレーラーのあいだは空行一つ。同じトレーラーを重ねない。

- Codex: `Co-authored-by: <モデル名> <noreply@openai.com>`
- Antigravity: `Co-authored-by: <モデル名> <gemini-code-assist@google.com>`
- Cursor: `Co-authored-by: <モデル名> <cursoragent@cursor.com>`

モデル名は、そのコミットを書いたモデルの名前にする。メールはツールの共有アドレスのままにし、個人のメールにはしない。ツールが `Codex` や `Cursor` だけのトレーラーを付けたときは、名前をモデル名に置き換え、二つ目は足さない。

Antigravity で Opus を使ったときは、モデル名を `opus5.5` のようにする（例: `Co-authored-by: opus5.5 <gemini-code-assist@google.com>`）。
