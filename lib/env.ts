// Centralised reader for NEXT_PUBLIC_* flags. The verify gate (Constitution V)
// greps the rest of the codebase to ensure nobody else reads process.env directly.

export const MAINNET_ENABLED: boolean =
  process.env.NEXT_PUBLIC_MAINNET_ENABLED === 'true';

export const BUILD_TIME: string =
  process.env.NEXT_PUBLIC_BUILD_TIME ?? 'dev';
