export const LINE_AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const LINE_PROFILE_URL = "https://api.line.me/v2/profile";
const LINE_FRIENDSHIP_URL = "https://api.line.me/friendship/v1/status";

export interface LineTokenResponse {
  access_token: string;
  expires_in: number;
  id_token?: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

export async function exchangeCodeForToken(params: {
  code: string;
  redirectUri: string;
  channelId: string;
  channelSecret: string;
}): Promise<LineTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.channelId,
    client_secret: params.channelSecret,
  });
  const res = await fetch(LINE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`line_token_exchange_failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getProfile(accessToken: string): Promise<LineProfile> {
  const res = await fetch(LINE_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`line_profile_failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getFriendshipStatus(accessToken: string): Promise<boolean> {
  const res = await fetch(LINE_FRIENDSHIP_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`line_friendship_check_failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { friendFlag: boolean };
  return data.friendFlag === true;
}
