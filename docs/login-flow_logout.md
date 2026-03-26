# ログインフロー: ログアウト処理

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Browser as ブラウザ<br>(React SPA)
    participant Server as Express サーバー<br>(server.ts)

    User->>Browser: 「ログアウト」ボタンをクリック
    Browser->>Server: GET /api/auth/logout<br>(window.location.href = '/api/auth/logout')
    Server->>Server: req.session = null<br>（セッションクッキーを破棄）
    Server-->>Browser: 302 Redirect → /
    Browser->>Server: GET /api/auth/me
    Server-->>Browser: 401 { error: "Not authenticated" }
    Browser->>User: ログイン画面を表示
```

## 補足

| ステップ | 実装箇所 |
|---|---|
| ログアウトボタン押下 | `handleLogout()` で `sessionStorage.removeItem('login_success_shown')` を実行後 `/api/auth/logout` へ遷移 |
| セッション破棄 | `req.session = null`（cookie-session の仕様: null に設定するとクッキーが削除される） |
| Twitter 側のトークン失効 | **行わない**（Twitter のトークンエンドポイントへの revocation リクエストは送信しない） |
