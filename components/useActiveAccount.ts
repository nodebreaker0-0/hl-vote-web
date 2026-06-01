'use client';

import { useEffect, useState } from 'react';
import { getActiveAccount, subscribeAccounts } from '@/lib/wallet/metamask';

/**
 * The live MetaMask account, updated on `accountsChanged`. Signing flows must
 * use whatever account is *currently* selected in MetaMask (and permitted for
 * this site), NOT a previously-stored address. To switch accounts the user must
 * Disconnect (revoke) then reconnect and pick the account.
 */
export function useActiveAccount(): `0x${string}` | null {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getActiveAccount().then((a) => {
      if (!cancelled) setAccount(a);
    });
    const unsub = subscribeAccounts((a) => setAccount(a));
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
  return account;
}
