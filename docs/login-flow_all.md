# ログインフロー: 全パターン

Twitter OAuth2/OIDC 認証サンプルの処理フローをまとめたドキュメントです。

## 目次

1. [ログイン開始〜成功](#1-ログイン開始成功)
2. [ログアウト処理](#2-ログアウト処理)
3. [エラーケース](#3-エラーケース)

---

## 1. ログイン開始〜成功

詳細: [login-flow_success.md](./login-flow_success.md)

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

---

## 2. ログアウト処理

詳細: [login-flow_logout.md](./login-flow_logout.md)

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

---

## 3. エラーケース

詳細: [login-flow_error.md](./login-flow_error.md)

### エラーケース 1: セッション不正 → 400

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Browser as ブラウザ<br>(React SPA)
    participant Server as Express サーバー<br>(server.ts)
    participant TwitterAuth as Twitter 認可エンドポイント

    User->>Browser: 「Twitter でログイン」ボタンをクリック
    Browser->>Server: GET /api/auth/login
    Server-->>Browser: 302 Redirect → Twitter 認可 URL
    Browser->>TwitterAuth: GET /i/oauth2/authorize?...
    User->>TwitterAuth: アプリを認可
    TwitterAuth-->>Browser: 302 Redirect → /api/auth/callback?code=...&state=...
    Browser->>Server: GET /api/auth/callback?code=...&state=...
    Server->>Server: セッションから codeVerifier と state を取得
    Note over Server: codeVerifier または state が存在しない<br>（セッション切れ等）
    Server-->>Browser: 400 Bad Request<br>"Invalid session state"
```

### エラーケース 2: state 不一致 / PKCE 検証失敗 → 500

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Browser as ブラウザ<br>(React SPA)
    participant Server as Express サーバー<br>(server.ts)
    participant TwitterAuth as Twitter 認可エンドポイント
    participant TwitterToken as Twitter トークンエンドポイント<br>(api.twitter.com/2/oauth2/token)

    User->>Browser: 「Twitter でログイン」ボタンをクリック
    Browser->>Server: GET /api/auth/login
    Server-->>Browser: 302 Redirect → Twitter 認可 URL
    Browser->>TwitterAuth: GET /i/oauth2/authorize?...
    User->>TwitterAuth: アプリを認可
    TwitterAuth-->>Browser: 302 Redirect → /api/auth/callback?code=...&state=TAMPERED
    Browser->>Server: GET /api/auth/callback?code=...&state=TAMPERED
    Server->>Server: セッションから codeVerifier と state を取得（存在する）
    Server->>TwitterToken: client.oauthCallback() 実行<br>（state またはPKCE 検証を含む）
    Note over Server: state 不一致 または PKCE 検証失敗<br>→ 例外がスロー
    Server->>Server: catch (err): console.error("Callback error:", err)
    Server-->>Browser: 500 Internal Server Error<br>"Authentication failed"
```

### エラーケース 3: アクセストークン未取得 → 500

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Browser as ブラウザ<br>(React SPA)
    participant Server as Express サーバー<br>(server.ts)
    participant TwitterAuth as Twitter 認可エンドポイント
    participant TwitterToken as Twitter トークンエンドポイント<br>(api.twitter.com/2/oauth2/token)

    User->>Browser: 「Twitter でログイン」ボタンをクリック
    Browser->>Server: GET /api/auth/login
    Server-->>Browser: 302 Redirect → Twitter 認可 URL
    Browser->>TwitterAuth: GET /i/oauth2/authorize?...
    User->>TwitterAuth: アプリを認可
    TwitterAuth-->>Browser: 302 Redirect → /api/auth/callback?code=...&state=...
    Browser->>Server: GET /api/auth/callback?code=...&state=...
    Server->>Server: セッションから codeVerifier と state を取得
    Server->>TwitterToken: POST /2/oauth2/token<br>(code + code_verifier)
    TwitterToken-->>Server: レスポンス（access_token が undefined）
    Note over Server: tokenSet.access_token が undefined
    Server-->>Browser: 500 Internal Server Error<br>"No access token received"
```

### エラーケース 4: ユーザー情報取得失敗 → 500

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Browser as ブラウザ<br>(React SPA)
    participant Server as Express サーバー<br>(server.ts)
    participant TwitterAuth as Twitter 認可エンドポイント
    participant TwitterToken as Twitter トークンエンドポイント<br>(api.twitter.com/2/oauth2/token)
    participant TwitterUser as Twitter ユーザー情報 API<br>(api.twitter.com/2/users/me)

    User->>Browser: 「Twitter でログイン」ボタンをクリック
    Browser->>Server: GET /api/auth/login
    Server-->>Browser: 302 Redirect → Twitter 認可 URL
    Browser->>TwitterAuth: GET /i/oauth2/authorize?...
    User->>TwitterAuth: アプリを認可
    TwitterAuth-->>Browser: 302 Redirect → /api/auth/callback?code=...&state=...
    Browser->>Server: GET /api/auth/callback?code=...&state=...
    Server->>Server: セッションから codeVerifier と state を取得
    Server->>TwitterToken: POST /2/oauth2/token<br>(code + code_verifier)
    TwitterToken-->>Server: アクセストークン
    Server->>TwitterUser: GET /2/users/me?user.fields=...<br>Authorization: Bearer <access_token>
    TwitterUser-->>Server: 非 2xx レスポンス<br>（401 / 403 / 429 / 500 等）
    Note over Server: userRes.ok === false
    Server-->>Browser: 500 Internal Server Error<br>"Failed to fetch user info from Twitter"
```
