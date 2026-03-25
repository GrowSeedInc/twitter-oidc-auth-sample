import 'dotenv/config';
import express from 'express';
import cookieSession from 'cookie-session';
import path from 'path';
import { Issuer, generators } from 'openid-client';

// --------------- Environment ---------------

const {
  TWITTER_CLIENT_ID,
  TWITTER_CLIENT_SECRET,
  CALLBACK_URL = 'http://localhost:3000/api/auth/callback',
  SESSION_SECRET = 'change_me_in_production',
  PORT = '3000',
} = process.env;

if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET) {
  throw new Error('TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET must be set');
}

// --------------- openid-client setup ---------------
// Twitter does not support OIDC Discovery, so we configure the Issuer manually.

const twitterIssuer = new Issuer({
  issuer: 'https://twitter.com',
  authorization_endpoint: 'https://twitter.com/i/oauth2/authorize',
  token_endpoint: 'https://api.twitter.com/2/oauth2/token',
  token_endpoint_auth_methods_supported: ['client_secret_basic'],
});

const client = new twitterIssuer.Client({
  client_id: TWITTER_CLIENT_ID,
  client_secret: TWITTER_CLIENT_SECRET,
  redirect_uris: [CALLBACK_URL],
  response_types: ['code'],
  token_endpoint_auth_method: 'client_secret_basic',
});

// --------------- Session type augmentation ---------------

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

app.use(
  cookieSession({
    name: 'session',
    secret: SESSION_SECRET,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
);

// --------------- Auth routes ---------------

// GET /api/auth/login
app.get('/api/auth/login', (req, res) => {
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  const state = generators.state();

  req.session!.codeVerifier = codeVerifier;
  req.session!.state = state;

  const authUrl = client.authorizationUrl({
    scope: 'tweet.read users.read offline.access',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  res.redirect(authUrl);
});

// GET /api/auth/callback
app.get('/api/auth/callback', (req, res) => {
  void (async () => {
  try {
    const codeVerifier = req.session!.codeVerifier;
    const sessionState = req.session!.state;

    if (!codeVerifier || !sessionState) {
      res.status(400).send('Invalid session state');
      return;
    }

    const params = client.callbackParams(req);
    const tokenSet = await client.oauthCallback(CALLBACK_URL, params, {
      code_verifier: codeVerifier,
      state: sessionState,
    });

    const accessToken = tokenSet.access_token;
    if (!accessToken) {
      res.status(500).send('No access token received');
      return;
    }

    // Fetch user info from Twitter v2 API
    const userRes = await fetch(
      'https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!userRes.ok) {
      res.status(500).send('Failed to fetch user info from Twitter');
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

    req.session!.user = userJson.data;
    // Clear PKCE / state values
    req.session!.codeVerifier = undefined;
    req.session!.state = undefined;

    res.redirect('/');
  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).send('Authentication failed');
  }
  })();
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
  const user = req.session?.user;
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json({ user });
});

// GET /api/auth/logout
app.get('/api/auth/logout', (req, res) => {
  req.session = null; // cookie-session: setting to null destroys the session
  res.redirect('/');
});

// --------------- Static file serving (SPA) ---------------

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));

app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// --------------- Start ---------------

app.listen(Number(PORT), () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
