import {
  DEFAULT_ACCOUNT_ID,
  resolveThreadSessionKeys,
  type ResolvedAgentRoute,
} from "openclaw/plugin-sdk/routing";

function resolveWhatsAppGroupAccountThreadId(accountId: string): string {
  return `whatsapp-account-${accountId}`;
}

export function resolveWhatsAppGroupSessionRoute(route: ResolvedAgentRoute): ResolvedAgentRoute {
  if (route.accountId === DEFAULT_ACCOUNT_ID || !route.sessionKey.includes(":group:")) {
    return route;
  }
  const scopedSession = resolveThreadSessionKeys({
    baseSessionKey: route.sessionKey,
    threadId: resolveWhatsAppGroupAccountThreadId(route.accountId),
  });
  return {
    ...route,
    sessionKey: scopedSession.sessionKey,
  };
}

export const __testing = {
  resolveWhatsAppGroupAccountThreadId,
};
