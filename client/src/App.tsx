import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Avatar,
  Typography,
  CircularProgress,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import Confetti from 'react-confetti';
import { z } from 'zod';

// --------------- Zod schemas ---------------

/**
 * Twitter ユーザー情報を検証する Zod スキーマ。
 *
 * - `id` — Twitter ユーザー ID（文字列）
 * - `name` — 表示名
 * - `username` — \@ハンドル（スクリーンネーム）
 * - `profile_image_url` — プロフィール画像 URL（省略可能）
 */
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  profile_image_url: z.string().url().optional(),
});

/**
 * {@link UserSchema} から推論された Twitter ユーザー情報の型。
 */
type User = z.infer<typeof UserSchema>;

/**
 * `/api/auth/me` のレスポンスボディを検証する Zod スキーマ。
 * `user` フィールドに {@link UserSchema} 準拠のオブジェクトを含む。
 */
const MeResponseSchema = z.object({
  user: UserSchema,
});

// --------------- LoginPage ---------------

/**
 * 未認証ユーザー向けのログインページコンポーネント。
 *
 * @returns Twitter でログインボタンを含むカードを画面中央に表示する JSX 要素
 */
function LoginPage() {
  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
    >
      <Card sx={{ minWidth: 320, textAlign: 'center', p: 2 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom fontWeight={700}>
            Twitter OIDC Auth Sample
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Twitter アカウントでログインしてください
          </Typography>
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={() => {
              window.location.href = '/api/auth/login';
            }}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Twitter でログイン
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

// --------------- ProfilePage ---------------

/**
 * 認証済みユーザー向けのプロフィールページコンポーネント。
 *
 * @param user - 表示する Twitter ユーザー情報
 * @param onLogout - ログアウトボタン押下時に呼び出されるコールバック
 * @param showSuccess - 初回ログイン成功演出（紙吹雪・成功メッセージ）を表示するかどうか
 * @returns ユーザー情報カードと（初回のみ）ログイン成功演出を含む JSX 要素
 */
function ProfilePage({ user, onLogout, showSuccess }: { user: User; onLogout: () => void; showSuccess: boolean }) {
  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      flexDirection="column"
      gap={2}
    >
      {/* 初回ログイン成功時のみ紙吹雪アニメーションを表示 */}
      {showSuccess && <Confetti />}
      {showSuccess && (
        <Typography variant="h6" fontWeight={700} color="success.main">
          ログインに成功しました🎉
        </Typography>
      )}
      <Card sx={{ minWidth: 320, textAlign: 'center', p: 2 }}>
        <CardContent>
          {/* ログイン中バッジ：チェックアイコンとテキストを横並びで表示 */}
          <Box display="flex" justifyContent="center" alignItems="center" gap={0.5} mb={1}>
            <CheckCircleIcon sx={{ color: 'green', fontSize: 18 }} />
            <Typography variant="body2" fontWeight={600}>ログイン中</Typography>
          </Box>
          {/* ユーザーのプロフィール画像を円形アバターで表示 */}
          <Avatar
            src={user.profile_image_url}
            alt={user.name}
            sx={{ width: 80, height: 80, mx: 'auto', mb: 2 }}
          />
          <Typography variant="h6" fontWeight={700}>
            {user.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            @{user.username}
          </Typography>
          <Button
            variant="outlined"
            size="large"
            fullWidth
            onClick={onLogout}
            sx={{ textTransform: 'none' }}
          >
            ログアウト
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

// --------------- App ---------------

/**
 * アプリ全体の認証状態を表す型。
 *
 * - `'loading'` — 認証状態を確認中
 * - `'authenticated'` — ログイン済み
 * - `'unauthenticated'` — 未ログイン
 */
type AppState = 'loading' | 'unauthenticated' | 'authenticated';

/**
 * アプリケーションのルートコンポーネント。
 * 認証状態に応じて {@link LoginPage} または {@link ProfilePage} を切り替えてレンダリングする。
 *
 * @returns 認証状態に応じたページコンポーネント
 */
export default function App() {
  const [state, setState] = useState<AppState>('loading'); // 現在の認証状態
  const [user, setUser] = useState<User | null>(null); // ログイン中のユーザー情報
  const [showSuccess, setShowSuccess] = useState(false); // ログイン成功演出の表示フラグ

  // マウント時に /api/auth/me を呼び出して認証状態を確認する
  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (res) => {
        if (!res.ok) {
          // 401 等、非 2xx レスポンスは未認証として扱う
          setState('unauthenticated');
          return;
        }
        const json: unknown = await res.json();
        const parsed = MeResponseSchema.safeParse(json);
        if (parsed.success) {
          // レスポンスが期待通りの形式であればユーザー情報をセット
          setUser(parsed.data.user);
          setState('authenticated');
          // 初回ログイン成功演出を一度だけ表示するためのフラグ管理
          if (!sessionStorage.getItem('login_success_shown')) {
            setShowSuccess(true);
            sessionStorage.setItem('login_success_shown', 'true');
          }
        } else {
          // レスポンスの形式が想定外の場合はエラーログを出して未認証に遷移
          console.error('Unexpected /api/auth/me shape', parsed.error);
          setState('unauthenticated');
        }
      })
      .catch(() => setState('unauthenticated'));
  }, []);

  /**
   * ログアウト処理を実行する。
   *
   * @returns void（ページ遷移のため戻り値はない）
   */
  const handleLogout = () => {
    // 次回ログイン時に成功演出を再表示できるようフラグを削除
    sessionStorage.removeItem('login_success_shown');
    // サーバーサイドのログアウトエンドポイントへリダイレクト
    window.location.href = '/api/auth/logout';
  };

  // 認証状態確認中はスピナーを表示
  if (state === 'loading') {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  // 認証済みの場合はプロフィールページを表示
  if (state === 'authenticated' && user) {
    return <ProfilePage user={user} onLogout={handleLogout} showSuccess={showSuccess} />;
  }

  // 未認証の場合はログインページを表示
  return <LoginPage />;
}
