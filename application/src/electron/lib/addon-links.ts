export const DEFAULT_MARKETPLACE_URL = 'https://ogi-marketplace.nat3z.com';

const CURRENT_WEB_MARKETPLACE_SOURCES = [
  'https://gitlab.com/fat-addons/fatboy-unpack',
  'https://github.com/Nat3z/gemini-search-addon',
  'https://github.com/Nat3z/steam-integration',
  'https://gitlab.com/fat-addons/steamrip-addon',
];

export const STEAM_INTEGRATION_FORK_URL =
  'https://github.com/shockstruck/steam-integration';

const NAT3Z_STEAM_INTEGRATION_URL =
  'https://github.com/Nat3z/steam-integration';

export const STEAMRIP_ADDON_FORK_URL =
  'https://github.com/shockstruck/steamrip-addon';

const UPSTREAM_STEAMRIP_ADDON_URL =
  'https://gitlab.com/fat-addons/steamrip-addon';

const CURRENT_WEB_MARKETPLACE_SOURCE_BY_CANONICAL = new Map(
  CURRENT_WEB_MARKETPLACE_SOURCES.map((source) => [
    canonicalizeAddonSource(source),
    source,
  ])
);

// Unlike steam-integration's Nat3z entry, SteamRip's upstream GitLab URL resolves
// straight to our fork on a fresh add, instead of the Nat3z marketplace listing,
// because the marketplace listing still points at unforked upstream. Kept as its
// own guarded lookup, checked ahead of the marketplace-source table, so it can't
// affect how any other source normalizes.
const FRESH_ADD_FORK_REDIRECT_BY_CANONICAL = new Map([
  [
    canonicalizeAddonSource(UPSTREAM_STEAMRIP_ADDON_URL),
    STEAMRIP_ADDON_FORK_URL,
  ],
]);

export function canonicalizeAddonSource(source: string): string {
  return source
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .toLowerCase();
}

export type ParsedAddonLink =
  | {
      kind: 'local';
      original: string;
      normalized: string;
      path: string;
      addonName: string;
    }
  | {
      kind: 'git';
      original: string;
      normalized: string;
      gitUrl: string;
      addonName: string;
    }
  | {
      kind: 'marketplace';
      original: string;
      normalized: string;
      marketplaceUrl: string;
      gitUrl: string;
      explicitRef?: string;
      addonName: string;
    };

export function getAddonNameFromGitUrl(gitUrl: string): string {
  const trimmed = gitUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const slashName = trimmed.split(/\/|\\/).pop();
  return (slashName || trimmed.split(':').pop() || trimmed).trim();
}

export function normalizeAddonLink(addonLink: string): string {
  const trimmed = addonLink.trim();
  if (!trimmed || trimmed.startsWith('local@')) {
    return trimmed;
  } else if (trimmed.startsWith('local:')) {
    return trimmed.replace(/^local:/, 'local@');
  }

  const forkRedirect = FRESH_ADD_FORK_REDIRECT_BY_CANONICAL.get(
    canonicalizeAddonSource(trimmed)
  );
  if (forkRedirect) {
    return `git@${forkRedirect}`;
  }

  const marketplaceSource = CURRENT_WEB_MARKETPLACE_SOURCE_BY_CANONICAL.get(
    canonicalizeAddonSource(trimmed)
  );
  if (marketplaceSource) {
    return `${DEFAULT_MARKETPLACE_URL}@${marketplaceSource}`;
  }

  // Legacy addon entries were often stored as a bare repository URL. Preserve the
  // no-marketplace behavior by explicitly marking them as git-managed addons.
  if (!trimmed.includes('@')) {
    return `git@${trimmed}`;
  }

  return trimmed;
}

function getAddonLinkIdentity(addonLink: string): string {
  const parsedAddon = parseAddonLink(addonLink);
  if (parsedAddon.kind === 'local') {
    return `local:${parsedAddon.path}`;
  }
  return `git:${canonicalizeAddonSource(parsedAddon.gitUrl)}`;
}

export function replaceAddonLink(
  addons: readonly string[],
  addonLink: string
): string[] {
  const identity = getAddonLinkIdentity(addonLink);
  const updatedAddons: string[] = [];
  let inserted = false;

  for (const existingAddon of addons) {
    if (getAddonLinkIdentity(existingAddon) !== identity) {
      updatedAddons.push(existingAddon);
    } else if (!inserted) {
      updatedAddons.push(addonLink);
      inserted = true;
    }
  }

  if (!inserted) updatedAddons.push(addonLink);
  return updatedAddons;
}

/**
 * Replaces any addon entry pointing at Nat3z's steam-integration (marketplace
 * or bare git form) with the ShockStruck fork, in place, without duplicating
 * an already-migrated fork entry. Returns `replaced: false` and the input
 * unchanged when no Nat3z entry is present.
 */
export function migrateNat3zSteamIntegrationAddon(addons: readonly string[]): {
  addons: string[];
  replaced: boolean;
} {
  const forkAddonLink = `git@${STEAM_INTEGRATION_FORK_URL}`;
  const forkIdentity = getAddonLinkIdentity(forkAddonLink);
  const nat3zCanonical = canonicalizeAddonSource(NAT3Z_STEAM_INTEGRATION_URL);

  let replacedAny = false;
  const rewritten = addons.map((addon) => {
    const parsed = parseAddonLink(addon);
    if (parsed.kind === 'local') return addon;
    if (canonicalizeAddonSource(parsed.gitUrl) === nat3zCanonical) {
      replacedAny = true;
      return forkAddonLink;
    }
    return addon;
  });

  if (!replacedAny) {
    return { addons: [...addons], replaced: false };
  }

  let seenFork = false;
  const deduped = rewritten.filter((addon) => {
    if (getAddonLinkIdentity(addon) !== forkIdentity) return true;
    if (seenFork) return false;
    seenFork = true;
    return true;
  });

  return { addons: deduped, replaced: true };
}

/**
 * Whether the steam-integration fork needs a repair install: the addons list
 * already names the fork (canonical `github.com/shockstruck/steam-integration`,
 * any link form) but its checkout's `installation.log` is missing — the
 * signature of an install event that never reached the renderer.
 */
export function needsSteamIntegrationForkRepair(
  addons: readonly string[],
  installLogExists: boolean
): boolean {
  if (installLogExists) return false;

  const forkCanonical = canonicalizeAddonSource(STEAM_INTEGRATION_FORK_URL);
  return addons.some((addon) => {
    const parsed = parseAddonLink(addon);
    if (parsed.kind === 'local') return false;
    return canonicalizeAddonSource(parsed.gitUrl) === forkCanonical;
  });
}

/**
 * Replaces any addon entry pointing at upstream's SteamRip addon (marketplace
 * or bare git form) with the ShockStruck fork, in place, without duplicating
 * an already-migrated fork entry. Returns `replaced: false` and the input
 * unchanged when no upstream entry is present.
 *
 * The bare-form and marketplace-form checks are done directly against the raw
 * entry's canonical source rather than via `parseAddonLink`, because
 * `normalizeAddonLink` now redirects a fresh bare upstream URL straight to the
 * fork (see `FRESH_ADD_FORK_REDIRECT_BY_CANONICAL`); routing a *stored* legacy
 * bare-form entry through that same normalization first would make it look
 * identical to an already-migrated fork entry and this migration would never
 * fire for it.
 */
export function migrateUpstreamSteamripAddon(addons: readonly string[]): {
  addons: string[];
  replaced: boolean;
} {
  const forkAddonLink = `git@${STEAMRIP_ADDON_FORK_URL}`;
  const forkIdentity = getAddonLinkIdentity(forkAddonLink);
  const upstreamCanonical = canonicalizeAddonSource(
    UPSTREAM_STEAMRIP_ADDON_URL
  );

  const isUpstreamSteamripEntry = (addon: string): boolean => {
    const trimmed = addon.trim();
    if (
      !trimmed ||
      trimmed.startsWith('local@') ||
      trimmed.startsWith('local:')
    ) {
      return false;
    }
    if (canonicalizeAddonSource(trimmed) === upstreamCanonical) return true;

    const parsed = parseAddonLink(addon);
    if (parsed.kind === 'local') return false;
    return canonicalizeAddonSource(parsed.gitUrl) === upstreamCanonical;
  };

  let replacedAny = false;
  const rewritten = addons.map((addon) => {
    if (isUpstreamSteamripEntry(addon)) {
      replacedAny = true;
      return forkAddonLink;
    }
    return addon;
  });

  if (!replacedAny) {
    return { addons: [...addons], replaced: false };
  }

  let seenFork = false;
  const deduped = rewritten.filter((addon) => {
    if (getAddonLinkIdentity(addon) !== forkIdentity) return true;
    if (seenFork) return false;
    seenFork = true;
    return true;
  });

  return { addons: deduped, replaced: true };
}

/**
 * Whether the SteamRip fork needs a repair install: the addons list already
 * names the fork (canonical `github.com/shockstruck/steamrip-addon`, any link
 * form) but its checkout's `installation.log` is missing — the signature of an
 * install event that never reached the renderer.
 */
export function needsSteamripForkRepair(
  addons: readonly string[],
  installLogExists: boolean
): boolean {
  if (installLogExists) return false;

  const forkCanonical = canonicalizeAddonSource(STEAMRIP_ADDON_FORK_URL);
  return addons.some((addon) => {
    const parsed = parseAddonLink(addon);
    if (parsed.kind === 'local') return false;
    return canonicalizeAddonSource(parsed.gitUrl) === forkCanonical;
  });
}

export function parseAddonLink(addonLink: string): ParsedAddonLink {
  const normalized = normalizeAddonLink(addonLink);

  if (normalized.startsWith('local@')) {
    const path = normalized.slice('local@'.length);
    return {
      kind: 'local',
      original: addonLink,
      normalized,
      path,
      addonName: getAddonNameFromGitUrl(path),
    };
  }

  if (normalized.startsWith('git@')) {
    const gitUrl = normalized.slice('git@'.length);

    // A raw SSH repository URL (git@host:owner/repo) is a git-managed addon,
    // not a marketplace association. Explicit git@ associations have a full URL
    // after the prefix (for example git@https://host/owner/repo) or another SSH
    // URL (git@git@host:owner/repo).
    // Raw SSH URLs (git@host:owner/repo) already start with git@, so treat the
    // full string as both the normalized link and the clone URL. Prefixing again
    // would produce corrupt git@git@host:owner/repo entries in config.
    if (
      !gitUrl.startsWith('http://') &&
      !gitUrl.startsWith('https://') &&
      !gitUrl.startsWith('ssh://') &&
      !gitUrl.startsWith('git@') &&
      /^git@[^/]+:.+/.test(normalized)
    ) {
      return {
        kind: 'git',
        original: addonLink,
        normalized,
        gitUrl: normalized,
        addonName: getAddonNameFromGitUrl(normalized),
      };
    }

    return {
      kind: 'git',
      original: addonLink,
      normalized,
      gitUrl,
      addonName: getAddonNameFromGitUrl(gitUrl),
    };
  }

  const separatorIndex = normalized.indexOf('@');
  if (separatorIndex === -1) {
    return {
      kind: 'git',
      original: addonLink,
      normalized: `git@${normalized}`,
      gitUrl: normalized,
      addonName: getAddonNameFromGitUrl(normalized),
    };
  }

  const marketplaceUrl = normalized.slice(0, separatorIndex);
  const gitUrlWithRef = normalized.slice(separatorIndex + 1);
  const refSeparatorIndex = gitUrlWithRef.lastIndexOf(':');
  // The override separator must appear after the repository path begins. This excludes
  // URL schemes, ports, and the host separator in git@host:owner/repository.
  const schemeSeparatorIndex = gitUrlWithRef.indexOf('://');
  const sshHostSeparatorIndex = /^git@/.test(gitUrlWithRef)
    ? gitUrlWithRef.indexOf(':')
    : -1;
  const pathSeparators = [
    gitUrlWithRef.indexOf('/'),
    gitUrlWithRef.indexOf('\\'),
  ].filter((index) => index !== -1);
  const repositoryPathIndex =
    schemeSeparatorIndex === -1
      ? pathSeparators.length > 0
        ? Math.min(...pathSeparators)
        : sshHostSeparatorIndex
      : gitUrlWithRef.indexOf('/', schemeSeparatorIndex + 3);
  const hasExplicitRef =
    repositoryPathIndex !== -1 &&
    refSeparatorIndex > Math.max(repositoryPathIndex, sshHostSeparatorIndex) &&
    refSeparatorIndex < gitUrlWithRef.length - 1;
  const gitUrl = hasExplicitRef
    ? gitUrlWithRef.slice(0, refSeparatorIndex)
    : gitUrlWithRef;
  const explicitRef = hasExplicitRef
    ? gitUrlWithRef.slice(refSeparatorIndex + 1)
    : undefined;
  return {
    kind: 'marketplace',
    original: addonLink,
    normalized,
    marketplaceUrl,
    gitUrl,
    explicitRef,
    addonName: getAddonNameFromGitUrl(gitUrl),
  };
}
