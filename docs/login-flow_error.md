# ログインフロー: エラーケース

## エラーケース一覧

| # | エラー | 発生タイミング | HTTPステータス | レスポンス |
|---|---|---|---|---|
| 1 | セッション不正 | コールバック受信時 | 400 | `Invalid session state` |
| 2 | state 不一致 / PKCE 検証失敗 | `oauthCallback()` 実行時 | 500 | `Authentication failed` |
| 3 | アクセストークン未取得 | トークン交換後 | 500 | `No access token received` |
| 4 | ユーザー情報取得失敗 | Twitter API 呼び出し後 | 500 | `Failed to fetch user info from Twitter` |

---

## エラーケース 1: セッション不正

コールバック受信時にセッションに `codeVerifier` または `state` が存在しない場合。
（セッション切れ・ブラウザのバック操作・不正アクセス等）

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

---

## エラーケース 2: state 不一致 / PKCE 検証失敗

`oauthCallback()` 内で state の不一致または PKCE (code_verifier) の検証に失敗した場合。
例外がスローされ catch ブロックで捕捉される。

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

---

## エラーケース 3: アクセストークン未取得

Twitter トークンエンドポイントからのレスポンスに `access_token` が含まれていない場合。

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

---

## エラーケース 4: ユーザー情報取得失敗

Twitter ユーザー情報 API が非 2xx ステータスを返した場合。

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
