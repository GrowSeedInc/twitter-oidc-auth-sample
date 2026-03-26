# ログインフロー: ログイン開始〜成功

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Browser as ブラウザ<br>(React SPA)
    participant Server as Express サーバー<br>(server.ts)
    participant TwitterAuth as Twitter 認可エンドポイント<br>(twitter.com/i/oauth2/authorize)
    participant TwitterToken as Twitter トークンエンドポイント<br>(api.twitter.com/2/oauth2/token)
    participant TwitterUser as Twitter ユーザー情報 API<br>(api.twitter.com/2/users/me)

    User->>Browser: 「Twitter でログイン」ボタンをクリック
    Browser->>Server: GET /api/auth/login
    Server->>Server: codeVerifier を生成<br>codeChallenge (S256) を生成<br>state を生成
    Server->>Server: セッションに codeVerifier と state を保存
    Server-->>Browser: 302 Redirect → Twitter 認可 URL<br>(scope, code_challenge, state を含む)
    Browser->>TwitterAuth: GET /i/oauth2/authorize?...
    User->>TwitterAuth: アプリを認可
    TwitterAuth-->>Browser: 302 Redirect → /api/auth/callback?code=...&state=...
    Browser->>Server: GET /api/auth/callback?code=...&state=...
    Server->>Server: セッションから codeVerifier と state を取得
    Server->>Server: コールバックパラメータを解析 (callbackParams)
    Server->>TwitterToken: POST /2/oauth2/token<br>(code + code_verifier + client credentials)
    TwitterToken-->>Server: アクセストークン
    Server->>TwitterUser: GET /2/users/me?user.fields=profile_image_url,name,username<br>Authorization: Bearer <access_token>
    TwitterUser-->>Server: ユーザー情報 (id, name, username, profile_image_url)
    Server->>Server: セッションに user を保存<br>セッションから codeVerifier と state を削除
    Server-->>Browser: 302 Redirect → /
    Browser->>Server: GET /api/auth/me
    Server-->>Browser: 200 { user: { id, name, username, profile_image_url } }
    Browser->>User: ログイン成功メッセージ（紙吹雪）を表示<br>プロフィール画面へ遷移
```

## 補足

| ステップ | 実装箇所 |
|---|---|
| codeVerifier / codeChallenge / state の生成 | `generators.codeVerifier()`, `generators.codeChallenge()`, `generators.state()` |
| セッション保存 | `req.session.codeVerifier`, `req.session.state` |
| 認可 URL の構築 | `client.authorizationUrl({ scope, code_challenge, code_challenge_method: "S256", state })` |
| トークン交換 | `client.oauthCallback(CALLBACK_URL, params, { code_verifier, state })` |
| ユーザー情報取得 | `fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username")` |
| ログイン成功の表示 | `sessionStorage` の `login_success_shown` フラグで初回のみ紙吹雪を表示 |
