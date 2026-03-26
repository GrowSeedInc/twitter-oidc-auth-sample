# ログイン成功後〜再アクセス時のセッション復元フロー

## 概要

`cookie-session` ミドルウェアがセッション情報（ユーザー情報）を署名付きCookieとして保存する。
Cookieの有効期限は24時間（`maxAge: 24 * 60 * 60 * 1000`）で、ブラウザを閉じても失効しない。
再アクセス時はブラウザが自動的にCookieを送信し、`/api/auth/me` でセッションを復元する。

---

## シーケンス図

```mermaid
sequenceDiagram
    autonumber
    participant Browser as ブラウザ
    participant React as React App (App.tsx)
    participant Server as Express Server (server.ts)
    participant Cookie as ブラウザの Cookie ストア

    Note over Browser,Cookie: 【前提】ログイン成功直後の状態
    Server->>Cookie: session Cookie を発行<br/>(user情報 + 署名, maxAge: 24h, httpOnly)
    Browser-->>Browser: ページを閉じる<br/>（sessionStorage はクリア、Cookie は保持）

    Note over Browser,Cookie: 【再アクセス】ページを再度開く

    Browser->>React: ページにアクセス / React App が起動
    React->>React: useState('loading') で初期化
    React->>React: useEffect が実行される

    React->>Server: GET /api/auth/me<br/>(Cookie: session=<署名付きCookie> が自動付与)
    Server->>Server: cookie-session が Cookie を検証・復号し<br/>req.session.user を復元
    alt セッションが有効 (24時間以内)
        Server->>React: 200 OK<br/>{ user: { id, name, username, profile_image_url } }
        React->>React: MeResponseSchema.safeParse() でバリデーション
        React->>React: setUser(parsed.data.user)<br/>setState('authenticated')
        React->>React: sessionStorage に 'login_success_shown' がないため<br/>showSuccess = false のまま
        React->>Browser: ProfilePage をレンダリング<br/>✅ チェックアイコン + "ログイン中" を表示<br/>（"ログインに成功しました🎉" は非表示）
    else セッションが期限切れ or Cookie なし
        Server->>React: 401 Unauthorized<br/>{ error: "Not authenticated" }
        React->>React: setState('unauthenticated')
        React->>Browser: LoginPage をレンダリング<br/>"Twitter でログイン" ボタンを表示
    end
```

---

## 補足

| 項目 | 値 | 補足 |
|------|-----|------|
| Cookie名 | `session` | `server.ts:69` |
| セッション有効期限 | 24時間 | `server.ts:71` |
| httpOnly | `true` | JSからアクセス不可（XSS対策）`server.ts:72` |
| secure | 本番環境のみ `true` | `server.ts:73` |
| sameSite | `lax` | CSRF対策 `server.ts:74` |
| ログイン成功演出の管理 | `sessionStorage` | ページを閉じるとクリアされる → 再アクセス時は"成功しました🎉"は非表示 `App.tsx:184` |
