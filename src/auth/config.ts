// Backend config from Vite env (see .env.example). All values are public client-side config,
// not secrets. When they're absent the app still runs — accounts/history just stay disabled.

export const cognitoConfig = {
  region: import.meta.env.VITE_AWS_REGION as string | undefined,
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined,
  domain: import.meta.env.VITE_COGNITO_DOMAIN as string | undefined,
};

export const apiUrl = import.meta.env.VITE_API_URL as string | undefined;

export const isAuthConfigured = Boolean(
  cognitoConfig.clientId && cognitoConfig.domain,
);
