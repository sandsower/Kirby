import type { VcsProvider } from './types.js';

/** Detect which provider owns this remote URL */
export function detectProvider(
  remoteUrl: string,
  providers: VcsProvider[]
): { provider: VcsProvider; projectConfig: Record<string, string> } | null {
  for (const provider of providers) {
    const projectConfig = provider.parseRemoteUrl(remoteUrl);
    if (projectConfig) {
      return { provider, projectConfig };
    }
  }
  return null;
}
