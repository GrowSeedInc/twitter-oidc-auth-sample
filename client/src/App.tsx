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
import { z } from 'zod';

// --------------- Zod schemas ---------------

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  profile_image_url: z.string().url().optional(),
});

type User = z.infer<typeof UserSchema>;

const MeResponseSchema = z.object({
  user: UserSchema,
});

// --------------- LoginPage ---------------

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

function ProfilePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
    >
      <Card sx={{ minWidth: 320, textAlign: 'center', p: 2 }}>
        <CardContent>
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

type AppState = 'loading' | 'unauthenticated' | 'authenticated';

export default function App() {
  const [state, setState] = useState<AppState>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (res) => {
        if (!res.ok) {
          setState('unauthenticated');
          return;
        }
        const json: unknown = await res.json();
        const parsed = MeResponseSchema.safeParse(json);
        if (parsed.success) {
          setUser(parsed.data.user);
          setState('authenticated');
        } else {
          console.error('Unexpected /api/auth/me shape', parsed.error);
          setState('unauthenticated');
        }
      })
      .catch(() => setState('unauthenticated'));
  }, []);

  const handleLogout = () => {
    window.location.href = '/api/auth/logout';
  };

  if (state === 'loading') {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (state === 'authenticated' && user) {
    return <ProfilePage user={user} onLogout={handleLogout} />;
  }

  return <LoginPage />;
}
