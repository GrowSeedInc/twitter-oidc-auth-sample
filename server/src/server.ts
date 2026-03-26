import "dotenv/config"; // .env ファイルを自動読み込みし、process.env に展開する
import express from "express"; // HTTP サーバーフレームワーク
import cookieSession from "cookie-session"; // セッションをクッキーに保存するミドルウェア
import path from "path"; // ファイルパス操作ユーティリティ
import { Issuer, generators } from "openid-client"; // OAuth2/OIDC クライアントライブラリ

// --------------- Environment ---------------

const {
  TWITTER_CLIENT_ID, // Twitter Developer Portal で発行されたクライアント ID
  TWITTER_CLIENT_SECRET, // Twitter Developer Portal で発行されたクライアントシークレット
  CALLBACK_URL = "http://localhost:3000/api/auth/callback", // OAuth2 認可後にリダイレクトされる URL
  SESSION_SECRET = "change_me_in_production", // クッキー署名用の秘密鍵
  PORT = "3000", // サーバーが待ち受けるポート番号
} = process.env;

if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET) {
  throw new Error("TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET must be set");
}

// --------------- openid-client setup ---------------

// Twitter は OIDC Discovery に非対応のため、エンドポイントを手動で指定して Issuer を構築する
const twitterIssuer = new Issuer({
  issuer: "https://twitter.com",
  authorization_endpoint: "https://twitter.com/i/oauth2/authorize",
  token_endpoint: "https://api.twitter.com/2/oauth2/token",
  token_endpoint_auth_methods_supported: ["client_secret_basic"],
});

// トークン交換・コールバック処理に使う OAuth2 クライアントインスタンス
const client = new twitterIssuer.Client({
  client_id: TWITTER_CLIENT_ID,
  client_secret: TWITTER_CLIENT_SECRET,
  redirect_uris: [CALLBACK_URL],
  response_types: ["code"],
  token_endpoint_auth_method: "client_secret_basic",
});

// --------------- Session type augmentation ---------------
// TypeScript で req.session のプロパティを型安全に扱うため、
// cookie-session が提供する CookieSessionObject インターフェースを拡張する

declare global {
  namespace CookieSessionInterfaces {
    interface CookieSessionObject {
      codeVerifier?: string;
      state?: string;
      user?: {
        id: string;
        name: string;
        username: string;
        profile_image_url?: string;
      };
    }
  }
}

// --------------- Express app ---------------

const app = express();

// Render などのリバースプロキシ経由でも secure クッキーが正しく動くように設定する
app.set("trust proxy", 1);

app.use(
  cookieSession({
    name: "session", // クッキー名
    secret: SESSION_SECRET, // クッキー署名用の秘密鍵
    maxAge: 24 * 60 * 60 * 1000, // セッション有効期限: 24 時間
    httpOnly: true, // JavaScript からクッキーにアクセス不可（XSS 対策）
    secure: process.env.NODE_ENV === "production", // 本番環境では HTTPS のみでクッキーを送信
    sameSite: "lax", // CSRF 対策: 同一サイトまたはトップレベルナビゲーションのみ送信
  }),
);

// --------------- Auth routes ---------------

/**
 * Twitter OAuth2 ログインを開始するエンドポイント。
 *
 * @remarks
 * PKCE（Proof Key for Code Exchange）フローを使用して Twitter の認証ページへリダイレクトする。
 * `codeVerifier` および `state` を生成してセッションに保存したうえで、
 * `openid-client` の `authorizationUrl()` で構築した認可エンドポイント URL へ
 * 302 リダイレクトを返す。スコープは `tweet.read users.read offline.access`。
 *
 * @param req - Express の Request オブジェクト。セッションへの書き込みに使用する。
 * @param res - Express の Response オブジェクト。Twitter 認可 URL へのリダイレクトに使用する。
 * @returns void（`res.redirect()` によりレスポンスを終了する）
 * @see {@link https://tools.ietf.org/html/rfc7636 | RFC 7636 - PKCE}
 * @see {@link https://developer.twitter.com/en/docs/authentication/oauth-2-0 | Twitter OAuth 2.0}
 */
app.get("/api/auth/login", (req, res) => {
  // PKCE の検証子（ランダムな文字列）を生成する
  const codeVerifier = generators.codeVerifier();
  // codeVerifier を SHA-256 でハッシュした値。Twitter の認可リクエストに含めて送信する
  const codeChallenge = generators.codeChallenge(codeVerifier);
  // CSRF 対策用のランダムな文字列
  const state = generators.state();

  // コールバック時の検証のために codeVerifier と state をセッションへ保存する
  req.session!.codeVerifier = codeVerifier;
  req.session!.state = state;

  // openid-client が PKCE パラメータを含む Twitter 認可ページの URL を構築する
  const authUrl = client.authorizationUrl({
    scope: "tweet.read users.read offline.access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  res.redirect(authUrl);
});

/**
 * Twitter OAuth2 コールバックを処理し、アクセストークンとユーザー情報を取得するエンドポイント。
 *
 * @remarks
 * Express のルートハンドラーは非同期関数を直接サポートしないため、
 * `void (async () => { ... })()` パターンで IIFE として非同期処理を実行する。
 *
 * 処理の流れ:
 * 1. セッションから `codeVerifier` と `state` を取り出す。存在しない場合は 400 を返す。
 * 2. `client.callbackParams(req)` でクエリパラメータを解析し、`client.oauthCallback()` で
 *    認可コードをアクセストークンに交換する（PKCE 検証を含む）。
 * 3. Twitter v2 API (`GET /2/users/me`) を Bearer トークンで呼び出しユーザー情報を取得する。
 * 4. ユーザー情報をセッションに保存し、PKCE/state 値をセッションから削除する。
 * 5. ルート (`/`) へリダイレクトする。
 *
 * @param req - Express の Request オブジェクト。セッションの読み書きおよびコールバックパラメータの取得に使用する。
 * @param res - Express の Response オブジェクト。成功時は `/` へリダイレクト、失敗時はエラーレスポンスを返す。
 * @returns void（非同期処理は IIFE 内で完結し、`res` を通じてレスポンスを終了する）
 * @throws {@link Error} `client.oauthCallback()` が PKCE または state の検証に失敗した場合、
 * または Twitter API へのネットワークリクエストが失敗した場合。
 * エラーは catch ブロックで捕捉され 500 レスポンスとして処理される。
 * @see {@link https://tools.ietf.org/html/rfc7636 | RFC 7636 - PKCE}
 * @see {@link https://developer.twitter.com/en/docs/authentication/oauth-2-0 | Twitter OAuth 2.0}
 */
app.get("/api/auth/callback", (req, res) => {
  void (async () => {
    try {
      // ログイン時にセッションへ保存した codeVerifier と state を取り出す
      const codeVerifier = req.session!.codeVerifier;
      const sessionState = req.session!.state;

      // 値が存在しない場合はセッション切れや不正なアクセスなので 400 を返す
      if (!codeVerifier || !sessionState) {
        res.status(400).send("Invalid session state");
        return;
      }

      // リクエストの URL クエリパラメータ（code, state 等）を解析する
      const params = client.callbackParams(req);
      // 認可コードをアクセストークンに交換する（PKCE 検証・state 検証を含む）
      const tokenSet = await client.oauthCallback(CALLBACK_URL, params, {
        code_verifier: codeVerifier,
        state: sessionState,
      });

      // アクセストークンが取得できなかった場合はエラーを返す
      const accessToken = tokenSet.access_token;
      if (!accessToken) {
        res.status(500).send("No access token received");
        return;
      }

      // Twitter v2 API でユーザー情報（ID・名前・ユーザー名・プロフィール画像）を取得する
      const userRes = await fetch(
        "https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!userRes.ok) {
        res.status(500).send("Failed to fetch user info from Twitter");
        return;
      }

      const userJson = (await userRes.json()) as {
        data: {
          id: string;
          name: string;
          username: string;
          profile_image_url?: string;
        };
      };

      // 取得したユーザー情報をセッションに保存し、PKCE/state 値をクリアする
      req.session!.user = userJson.data;
      req.session!.codeVerifier = undefined;
      req.session!.state = undefined;

      res.redirect("/");
    } catch (err) {
      console.error("Callback error:", err);
      res.status(500).send("Authentication failed");
    }
  })();
});

/**
 * 現在ログイン中のユーザー情報を返すエンドポイント。
 *
 * @remarks
 * セッションに `user` オブジェクトが存在する場合は JSON でユーザー情報を返す。
 * 存在しない場合（未認証または期限切れセッション）は 401 を返す。
 * フロントエンドがログイン状態を確認するためのポーリングエンドポイントとして使用される。
 *
 * @param req - Express の Request オブジェクト。セッションからユーザー情報を読み取るために使用する。
 * @param res - Express の Response オブジェクト。認証済みは `{ user }` を JSON で返し、未認証は `{ error }` と共に 401 を返す。
 * @returns void（`res.json()` または `res.status().json()` によりレスポンスを終了する）
 * @example
 * ```http
 * GET /api/auth/me
 * Cookie: session=<signed-cookie>
 *
 * HTTP/1.1 200 OK
 * Content-Type: application/json
 * { "user": { "id": "123", "name": "Taro", "username": "taro", "profile_image_url": "https://..." } }
 * ```
 */
app.get("/api/auth/me", (req, res) => {
  const user = req.session?.user;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ user });
});

/**
 * セッションを破棄してトップページへリダイレクトするログアウトエンドポイント。
 *
 * @remarks
 * `cookie-session` の仕様に従い、`req.session` を `null` に設定することでセッションクッキーを
 * 削除する。Twitter 側のトークン失効（revocation）は行わない点に注意。
 * ログアウト後はルート (`/`) へ 302 リダイレクトする。
 *
 * @param req - Express の Request オブジェクト。セッションの破棄に使用する。
 * @param res - Express の Response オブジェクト。`/` へのリダイレクトに使用する。
 * @returns void（`res.redirect()` によりレスポンスを終了する）
 */
app.get("/api/auth/logout", (req, res) => {
  req.session = null; // cookie-session: setting to null destroys the session
  res.redirect("/");
});

// --------------- Static file serving (SPA) ---------------

// フロントエンドのビルド成果物ディレクトリへの絶対パス
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
// ビルド済みアセット（JS/CSS 等）を静的ファイルとして配信する
app.use(express.static(clientDist));

// 上記で一致しなかったパスはすべて index.html を返し、SPA のクライアントサイドルーティングに対応する
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

// --------------- Start ---------------

app.listen(Number(PORT), () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
