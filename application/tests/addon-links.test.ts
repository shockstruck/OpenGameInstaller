import { describe, expect, test } from 'bun:test';
import {
  migrateNat3zSteamIntegrationAddon,
  normalizeAddonLink,
  parseAddonLink,
  replaceAddonLink,
  STEAM_INTEGRATION_FORK_URL,
} from '../src/electron/lib/addon-links';

describe('marketplace addon refs', () => {
  test('parses an explicit branch without including it in the addon URL or name', () => {
    const link =
      'https://marketplace.example@https://github.com/example/addon.git:feature/new-api';

    expect(parseAddonLink(link)).toEqual({
      kind: 'marketplace',
      original: link,
      normalized: link,
      marketplaceUrl: 'https://marketplace.example',
      gitUrl: 'https://github.com/example/addon.git',
      explicitRef: 'feature/new-api',
      addonName: 'addon',
    });
  });

  test('parses an explicit commit hash', () => {
    const parsed = parseAddonLink(
      'https://marketplace.example@https://github.com/example/addon:abc123'
    );

    expect(parsed.kind).toBe('marketplace');
    if (parsed.kind !== 'marketplace') return;
    expect(parsed.gitUrl).toBe('https://github.com/example/addon');
    expect(parsed.explicitRef).toBe('abc123');
  });

  test('does not treat an SSH repository separator as an explicit ref', () => {
    const parsed = parseAddonLink(
      'https://marketplace.example@git@github.com:example/addon'
    );

    expect(parsed.kind).toBe('marketplace');
    if (parsed.kind !== 'marketplace') return;
    expect(parsed.gitUrl).toBe('git@github.com:example/addon');
    expect(parsed.explicitRef).toBeUndefined();
  });

  test.each([
    {
      link: 'https://marketplace.example@git@example.com:addon.git:develop',
      gitUrl: 'git@example.com:addon.git',
      explicitRef: 'develop',
    },
    {
      link: 'https://marketplace.example@ssh://git@example.com:2222/addon.git:develop',
      gitUrl: 'ssh://git@example.com:2222/addon.git',
      explicitRef: 'develop',
    },
    {
      link: 'https://marketplace.example@https://example.com/addon.git:',
      gitUrl: 'https://example.com/addon.git:',
      explicitRef: undefined,
    },
  ])('handles ref delimiters in $link', ({ link, gitUrl, explicitRef }) => {
    const parsed = parseAddonLink(link);

    expect(parsed.kind).toBe('marketplace');
    if (parsed.kind !== 'marketplace') return;
    expect(parsed.gitUrl).toBe(gitUrl);
    expect(parsed.explicitRef).toBe(explicitRef);
  });

  test('preserves the explicit ref while normalizing the addon link', () => {
    const link =
      'https://marketplace.example@https://github.com/example/addon:develop';

    expect(normalizeAddonLink(` ${link} `)).toBe(link);
  });

  test('replaces existing registrations for the same repository', () => {
    const existing =
      'https://marketplace.example@https://github.com/example/addon';
    const replacement = `${existing}:develop`;

    expect(
      replaceAddonLink(
        [existing, replacement, 'git@https://github.com/example/other'],
        replacement
      )
    ).toEqual([replacement, 'git@https://github.com/example/other']);
    expect(replaceAddonLink([replacement], existing)).toEqual([existing]);
  });
});

describe('steam-integration fork default', () => {
  test('the fork link parses as a git-managed addon named steam-integration', () => {
    const parsed = parseAddonLink(`git@${STEAM_INTEGRATION_FORK_URL}`);

    expect(parsed.kind).toBe('git');
    if (parsed.kind !== 'git') return;
    expect(parsed.gitUrl).toBe(STEAM_INTEGRATION_FORK_URL);
    expect(parsed.addonName).toBe('steam-integration');
  });

  test('the Nat3z URL still normalizes to a marketplace link', () => {
    const parsed = parseAddonLink('https://github.com/Nat3z/steam-integration');

    expect(parsed.kind).toBe('marketplace');
    if (parsed.kind !== 'marketplace') return;
    expect(parsed.marketplaceUrl).toBe('https://ogi-marketplace.nat3z.com');
    expect(parsed.gitUrl).toBe('https://github.com/Nat3z/steam-integration');
    expect(parsed.addonName).toBe('steam-integration');
  });
});

describe('migrateNat3zSteamIntegrationAddon', () => {
  test('replaces a marketplace-form Nat3z entry with the fork, in place', () => {
    const result = migrateNat3zSteamIntegrationAddon([
      'git@https://gitlab.com/fat-addons/fatboy-unpack',
      'https://ogi-marketplace.nat3z.com@https://github.com/Nat3z/steam-integration',
      'git@https://gitlab.com/fat-addons/steamrip-addon',
    ]);

    expect(result.replaced).toBe(true);
    expect(result.addons).toEqual([
      'git@https://gitlab.com/fat-addons/fatboy-unpack',
      `git@${STEAM_INTEGRATION_FORK_URL}`,
      'git@https://gitlab.com/fat-addons/steamrip-addon',
    ]);
  });

  test('replaces a bare-form Nat3z entry with the fork, in place', () => {
    const result = migrateNat3zSteamIntegrationAddon([
      'git@https://gitlab.com/fat-addons/fatboy-unpack',
      'https://github.com/Nat3z/steam-integration',
    ]);

    expect(result.replaced).toBe(true);
    expect(result.addons).toEqual([
      'git@https://gitlab.com/fat-addons/fatboy-unpack',
      `git@${STEAM_INTEGRATION_FORK_URL}`,
    ]);
  });

  test('does nothing when there is no Nat3z entry', () => {
    const addons = [
      'git@https://gitlab.com/fat-addons/fatboy-unpack',
      'git@https://gitlab.com/fat-addons/steamrip-addon',
    ];

    const result = migrateNat3zSteamIntegrationAddon(addons);

    expect(result.replaced).toBe(false);
    expect(result.addons).toEqual(addons);
  });

  test('does nothing when the addon is already migrated to the fork', () => {
    const addons = [
      'git@https://gitlab.com/fat-addons/fatboy-unpack',
      `git@${STEAM_INTEGRATION_FORK_URL}`,
    ];

    const result = migrateNat3zSteamIntegrationAddon(addons);

    expect(result.replaced).toBe(false);
    expect(result.addons).toEqual(addons);
  });

  test('does not duplicate the fork entry if both Nat3z and the fork are already present', () => {
    const result = migrateNat3zSteamIntegrationAddon([
      `git@${STEAM_INTEGRATION_FORK_URL}`,
      'https://github.com/Nat3z/steam-integration',
    ]);

    expect(result.replaced).toBe(true);
    expect(result.addons).toEqual([`git@${STEAM_INTEGRATION_FORK_URL}`]);
  });
});
