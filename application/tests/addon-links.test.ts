import { describe, expect, test } from 'bun:test';
import semver from 'semver';
import {
  appendDodiAddon,
  DODI_ADDON_MIGRATION_FROM,
  DODI_ADDON_MIGRATION_TO,
  DODI_ADDON_URL,
  FATBOY_UNPACK_FORK_URL,
  migrateNat3zSteamIntegrationAddon,
  migrateUpstreamFatboyUnpackAddon,
  migrateUpstreamSteamripAddon,
  needsDodiAddonRepair,
  needsFatboyUnpackForkRepair,
  needsSteamIntegrationForkRepair,
  needsSteamripForkRepair,
  normalizeAddonLink,
  parseAddonLink,
  redirectUpstreamFatboyUnpackAddonToFork,
  redirectUpstreamSteamripAddonToFork,
  replaceAddonLink,
  STEAM_INTEGRATION_FORK_URL,
  STEAMRIP_ADDON_FORK_URL,
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

describe('needsSteamIntegrationForkRepair', () => {
  test('is true when the fork link is present with no install log', () => {
    expect(
      needsSteamIntegrationForkRepair(
        [`git@${STEAM_INTEGRATION_FORK_URL}`],
        false
      )
    ).toBe(true);
  });

  test('is false when the install log is present', () => {
    expect(
      needsSteamIntegrationForkRepair(
        [`git@${STEAM_INTEGRATION_FORK_URL}`],
        true
      )
    ).toBe(false);
  });

  test('is false when only the Nat3z entry is present', () => {
    expect(
      needsSteamIntegrationForkRepair(
        ['https://github.com/Nat3z/steam-integration'],
        false
      )
    ).toBe(false);
  });

  test('is false for an empty addons list', () => {
    expect(needsSteamIntegrationForkRepair([], false)).toBe(false);
  });
});

describe('steamrip-addon fork default', () => {
  test('the fork link parses as a git-managed addon named steamrip-addon', () => {
    const parsed = parseAddonLink(`git@${STEAMRIP_ADDON_FORK_URL}`);

    expect(parsed.kind).toBe('git');
    if (parsed.kind !== 'git') return;
    expect(parsed.gitUrl).toBe(STEAMRIP_ADDON_FORK_URL);
    expect(parsed.addonName).toBe('steamrip-addon');
  });

  test('the upstream GitLab URL still normalizes to a marketplace link', () => {
    const parsed = parseAddonLink('https://gitlab.com/fat-addons/steamrip-addon');

    expect(parsed.kind).toBe('marketplace');
    if (parsed.kind !== 'marketplace') return;
    expect(parsed.marketplaceUrl).toBe('https://ogi-marketplace.nat3z.com');
    expect(parsed.gitUrl).toBe('https://gitlab.com/fat-addons/steamrip-addon');
    expect(parsed.addonName).toBe('steamrip-addon');
  });
});

describe('redirectUpstreamSteamripAddonToFork', () => {
  test('redirects a bare upstream URL to the fork', () => {
    expect(
      redirectUpstreamSteamripAddonToFork(
        'https://gitlab.com/fat-addons/steamrip-addon'
      )
    ).toBe(`git@${STEAMRIP_ADDON_FORK_URL}`);
  });

  test('redirects a git@ upstream URL to the fork', () => {
    expect(
      redirectUpstreamSteamripAddonToFork(
        'git@https://gitlab.com/fat-addons/steamrip-addon'
      )
    ).toBe(`git@${STEAMRIP_ADDON_FORK_URL}`);
  });

  test('redirects the marketplace-form upstream entry to the fork', () => {
    expect(
      redirectUpstreamSteamripAddonToFork(
        'https://ogi-marketplace.nat3z.com@https://gitlab.com/fat-addons/steamrip-addon'
      )
    ).toBe(`git@${STEAMRIP_ADDON_FORK_URL}`);
  });

  test('redirects .git-suffixed, trailing-slash, and mixed-case variants to the fork', () => {
    for (const variant of [
      'https://GitLab.com/fat-addons/steamrip-addon',
      'https://gitlab.com/fat-addons/steamrip-addon/',
      'https://gitlab.com/fat-addons/steamrip-addon.git',
    ]) {
      expect(redirectUpstreamSteamripAddonToFork(variant)).toBe(
        `git@${STEAMRIP_ADDON_FORK_URL}`
      );
    }
  });

  test('leaves an already-migrated fork link unchanged', () => {
    const link = `git@${STEAMRIP_ADDON_FORK_URL}`;
    expect(redirectUpstreamSteamripAddonToFork(link)).toBe(link);
  });

  test('leaves another addon unchanged', () => {
    const link = 'git@https://gitlab.com/fat-addons/fatboy-unpack';
    expect(redirectUpstreamSteamripAddonToFork(link)).toBe(link);
  });

  test('leaves a local addon entry unchanged', () => {
    const link = 'local@/home/user/my-addon';
    expect(redirectUpstreamSteamripAddonToFork(link)).toBe(link);
  });
});

describe('migrateUpstreamSteamripAddon', () => {
  test('replaces a marketplace-form upstream entry with the fork, in place', () => {
    const result = migrateUpstreamSteamripAddon([
      'git@https://gitlab.com/fat-addons/fatboy-unpack',
      'https://ogi-marketplace.nat3z.com@https://gitlab.com/fat-addons/steamrip-addon',
      `git@${STEAM_INTEGRATION_FORK_URL}`,
    ]);

    expect(result.replaced).toBe(true);
    expect(result.addons).toEqual([
      'git@https://gitlab.com/fat-addons/fatboy-unpack',
      `git@${STEAMRIP_ADDON_FORK_URL}`,
      `git@${STEAM_INTEGRATION_FORK_URL}`,
    ]);
  });

  test('replaces a bare-form upstream entry with the fork, in place', () => {
    const result = migrateUpstreamSteamripAddon([
      'git@https://gitlab.com/fat-addons/fatboy-unpack',
      'https://gitlab.com/fat-addons/steamrip-addon',
    ]);

    expect(result.replaced).toBe(true);
    expect(result.addons).toEqual([
      'git@https://gitlab.com/fat-addons/fatboy-unpack',
      `git@${STEAMRIP_ADDON_FORK_URL}`,
    ]);
  });

  test('replaces a .git-suffixed, trailing-slash, or mixed-case upstream entry with the fork', () => {
    const result = migrateUpstreamSteamripAddon([
      'git@https://GitLab.com/fat-addons/steamrip-addon.git/',
    ]);

    expect(result.replaced).toBe(true);
    expect(result.addons).toEqual([`git@${STEAMRIP_ADDON_FORK_URL}`]);
  });

  test('does nothing when there is no upstream entry', () => {
    const addons = [
      'git@https://gitlab.com/fat-addons/fatboy-unpack',
      `git@${STEAM_INTEGRATION_FORK_URL}`,
    ];

    const result = migrateUpstreamSteamripAddon(addons);

    expect(result.replaced).toBe(false);
    expect(result.addons).toEqual(addons);
  });

  test('does nothing when the addon is already migrated to the fork', () => {
    const addons = [
      'git@https://gitlab.com/fat-addons/fatboy-unpack',
      `git@${STEAMRIP_ADDON_FORK_URL}`,
    ];

    const result = migrateUpstreamSteamripAddon(addons);

    expect(result.replaced).toBe(false);
    expect(result.addons).toEqual(addons);
  });

  test('leaves a local addon entry untouched', () => {
    const addons = ['local@/home/user/my-addon'];

    const result = migrateUpstreamSteamripAddon(addons);

    expect(result.replaced).toBe(false);
    expect(result.addons).toEqual(addons);
  });

  test('does not duplicate the fork entry if both the upstream marketplace form and the fork are already present', () => {
    const result = migrateUpstreamSteamripAddon([
      `git@${STEAMRIP_ADDON_FORK_URL}`,
      'https://ogi-marketplace.nat3z.com@https://gitlab.com/fat-addons/steamrip-addon',
    ]);

    expect(result.replaced).toBe(true);
    expect(result.addons).toEqual([`git@${STEAMRIP_ADDON_FORK_URL}`]);
  });

  test('still replaces a stored bare entry after the 4.1.0 migration normalizes it to marketplace form', () => {
    const storedBareEntry = 'https://gitlab.com/fat-addons/steamrip-addon';
    const afterAddonSourceMigration = normalizeAddonLink(storedBareEntry);

    const result = migrateUpstreamSteamripAddon([afterAddonSourceMigration]);

    expect(result.replaced).toBe(true);
    expect(result.addons).toEqual([`git@${STEAMRIP_ADDON_FORK_URL}`]);
  });
});

describe('needsSteamripForkRepair', () => {
  test('is true when the fork link is present with no install log', () => {
    expect(
      needsSteamripForkRepair([`git@${STEAMRIP_ADDON_FORK_URL}`], false)
    ).toBe(true);
  });

  test('is false when the install log is present', () => {
    expect(
      needsSteamripForkRepair([`git@${STEAMRIP_ADDON_FORK_URL}`], true)
    ).toBe(false);
  });

  test('is false when only the upstream marketplace-form entry is present', () => {
    expect(
      needsSteamripForkRepair(
        [
          'https://ogi-marketplace.nat3z.com@https://gitlab.com/fat-addons/steamrip-addon',
        ],
        false
      )
    ).toBe(false);
  });

  test('is false for an empty addons list', () => {
    expect(needsSteamripForkRepair([], false)).toBe(false);
  });
});

describe('fatboy-unpack fork default', () => {
  test('the fork link parses as a git-managed addon named fatboy-unpack', () => {
    const parsed = parseAddonLink(`git@${FATBOY_UNPACK_FORK_URL}`);

    expect(parsed.kind).toBe('git');
    if (parsed.kind !== 'git') return;
    expect(parsed.gitUrl).toBe(FATBOY_UNPACK_FORK_URL);
    expect(parsed.addonName).toBe('fatboy-unpack');
  });

  test('the upstream GitLab URL still normalizes to a marketplace link', () => {
    const parsed = parseAddonLink('https://gitlab.com/fat-addons/fatboy-unpack');

    expect(parsed.kind).toBe('marketplace');
    if (parsed.kind !== 'marketplace') return;
    expect(parsed.marketplaceUrl).toBe('https://ogi-marketplace.nat3z.com');
    expect(parsed.gitUrl).toBe('https://gitlab.com/fat-addons/fatboy-unpack');
    expect(parsed.addonName).toBe('fatboy-unpack');
  });
});

describe('redirectUpstreamFatboyUnpackAddonToFork', () => {
  test('redirects a bare upstream URL to the fork', () => {
    expect(
      redirectUpstreamFatboyUnpackAddonToFork(
        'https://gitlab.com/fat-addons/fatboy-unpack'
      )
    ).toBe(`git@${FATBOY_UNPACK_FORK_URL}`);
  });

  test('redirects a git@ upstream URL to the fork', () => {
    expect(
      redirectUpstreamFatboyUnpackAddonToFork(
        'git@https://gitlab.com/fat-addons/fatboy-unpack'
      )
    ).toBe(`git@${FATBOY_UNPACK_FORK_URL}`);
  });

  test('redirects the marketplace-form upstream entry to the fork', () => {
    expect(
      redirectUpstreamFatboyUnpackAddonToFork(
        'https://ogi-marketplace.nat3z.com@https://gitlab.com/fat-addons/fatboy-unpack'
      )
    ).toBe(`git@${FATBOY_UNPACK_FORK_URL}`);
  });

  test('redirects .git-suffixed, trailing-slash, and mixed-case variants to the fork', () => {
    for (const variant of [
      'https://GitLab.com/fat-addons/fatboy-unpack',
      'https://gitlab.com/fat-addons/fatboy-unpack/',
      'https://gitlab.com/fat-addons/fatboy-unpack.git',
    ]) {
      expect(redirectUpstreamFatboyUnpackAddonToFork(variant)).toBe(
        `git@${FATBOY_UNPACK_FORK_URL}`
      );
    }
  });

  test('leaves an already-migrated fork link unchanged', () => {
    const link = `git@${FATBOY_UNPACK_FORK_URL}`;
    expect(redirectUpstreamFatboyUnpackAddonToFork(link)).toBe(link);
  });

  test('leaves another addon unchanged', () => {
    const link = 'git@https://gitlab.com/fat-addons/steamrip-addon';
    expect(redirectUpstreamFatboyUnpackAddonToFork(link)).toBe(link);
  });

  test('leaves a local addon entry unchanged', () => {
    const link = 'local@/home/user/my-addon';
    expect(redirectUpstreamFatboyUnpackAddonToFork(link)).toBe(link);
  });
});

describe('migrateUpstreamFatboyUnpackAddon', () => {
  test('replaces a marketplace-form upstream entry with the fork, in place', () => {
    const result = migrateUpstreamFatboyUnpackAddon([
      'git@https://gitlab.com/fat-addons/steamrip-addon',
      'https://ogi-marketplace.nat3z.com@https://gitlab.com/fat-addons/fatboy-unpack',
      `git@${STEAM_INTEGRATION_FORK_URL}`,
    ]);

    expect(result.replaced).toBe(true);
    expect(result.addons).toEqual([
      'git@https://gitlab.com/fat-addons/steamrip-addon',
      `git@${FATBOY_UNPACK_FORK_URL}`,
      `git@${STEAM_INTEGRATION_FORK_URL}`,
    ]);
  });

  test('replaces a bare-form upstream entry with the fork, in place', () => {
    const result = migrateUpstreamFatboyUnpackAddon([
      'git@https://gitlab.com/fat-addons/steamrip-addon',
      'https://gitlab.com/fat-addons/fatboy-unpack',
    ]);

    expect(result.replaced).toBe(true);
    expect(result.addons).toEqual([
      'git@https://gitlab.com/fat-addons/steamrip-addon',
      `git@${FATBOY_UNPACK_FORK_URL}`,
    ]);
  });

  test('replaces a .git-suffixed, trailing-slash, or mixed-case upstream entry with the fork', () => {
    const result = migrateUpstreamFatboyUnpackAddon([
      'git@https://GitLab.com/fat-addons/fatboy-unpack.git/',
    ]);

    expect(result.replaced).toBe(true);
    expect(result.addons).toEqual([`git@${FATBOY_UNPACK_FORK_URL}`]);
  });

  test('does nothing when there is no upstream entry', () => {
    const addons = [
      'git@https://gitlab.com/fat-addons/steamrip-addon',
      `git@${STEAM_INTEGRATION_FORK_URL}`,
    ];

    const result = migrateUpstreamFatboyUnpackAddon(addons);

    expect(result.replaced).toBe(false);
    expect(result.addons).toEqual(addons);
  });

  test('does nothing when the addon is already migrated to the fork', () => {
    const addons = [
      'git@https://gitlab.com/fat-addons/steamrip-addon',
      `git@${FATBOY_UNPACK_FORK_URL}`,
    ];

    const result = migrateUpstreamFatboyUnpackAddon(addons);

    expect(result.replaced).toBe(false);
    expect(result.addons).toEqual(addons);
  });

  test('leaves a local addon entry untouched', () => {
    const addons = ['local@/home/user/my-addon'];

    const result = migrateUpstreamFatboyUnpackAddon(addons);

    expect(result.replaced).toBe(false);
    expect(result.addons).toEqual(addons);
  });

  test('does not duplicate the fork entry if both the upstream marketplace form and the fork are already present', () => {
    const result = migrateUpstreamFatboyUnpackAddon([
      `git@${FATBOY_UNPACK_FORK_URL}`,
      'https://ogi-marketplace.nat3z.com@https://gitlab.com/fat-addons/fatboy-unpack',
    ]);

    expect(result.replaced).toBe(true);
    expect(result.addons).toEqual([`git@${FATBOY_UNPACK_FORK_URL}`]);
  });

  test('still replaces a stored bare entry after the 4.1.0 migration normalizes it to marketplace form', () => {
    const storedBareEntry = 'https://gitlab.com/fat-addons/fatboy-unpack';
    const afterAddonSourceMigration = normalizeAddonLink(storedBareEntry);

    const result = migrateUpstreamFatboyUnpackAddon([afterAddonSourceMigration]);

    expect(result.replaced).toBe(true);
    expect(result.addons).toEqual([`git@${FATBOY_UNPACK_FORK_URL}`]);
  });
});

describe('needsFatboyUnpackForkRepair', () => {
  test('is true when the fork link is present with no install log', () => {
    expect(
      needsFatboyUnpackForkRepair([`git@${FATBOY_UNPACK_FORK_URL}`], false)
    ).toBe(true);
  });

  test('is false when the install log is present', () => {
    expect(
      needsFatboyUnpackForkRepair([`git@${FATBOY_UNPACK_FORK_URL}`], true)
    ).toBe(false);
  });

  test('is false when only the upstream marketplace-form entry is present', () => {
    expect(
      needsFatboyUnpackForkRepair(
        [
          'https://ogi-marketplace.nat3z.com@https://gitlab.com/fat-addons/fatboy-unpack',
        ],
        false
      )
    ).toBe(false);
  });

  test('is false for an empty addons list', () => {
    expect(needsFatboyUnpackForkRepair([], false)).toBe(false);
  });
});

describe('SteamRip and Fatboy unpack redirects do not affect each other', () => {
  test('redirectUpstreamSteamripAddonToFork leaves the Fatboy upstream and fork links unchanged', () => {
    expect(
      redirectUpstreamSteamripAddonToFork(
        'https://gitlab.com/fat-addons/fatboy-unpack'
      )
    ).toBe('https://gitlab.com/fat-addons/fatboy-unpack');
    expect(
      redirectUpstreamSteamripAddonToFork(`git@${FATBOY_UNPACK_FORK_URL}`)
    ).toBe(`git@${FATBOY_UNPACK_FORK_URL}`);
  });

  test('redirectUpstreamFatboyUnpackAddonToFork leaves the SteamRip upstream and fork links unchanged', () => {
    expect(
      redirectUpstreamFatboyUnpackAddonToFork(
        'https://gitlab.com/fat-addons/steamrip-addon'
      )
    ).toBe('https://gitlab.com/fat-addons/steamrip-addon');
    expect(
      redirectUpstreamFatboyUnpackAddonToFork(`git@${STEAMRIP_ADDON_FORK_URL}`)
    ).toBe(`git@${STEAMRIP_ADDON_FORK_URL}`);
  });

  test('migrateUpstreamSteamripAddon leaves an upstream Fatboy entry untouched', () => {
    const addons = ['https://gitlab.com/fat-addons/fatboy-unpack'];

    const result = migrateUpstreamSteamripAddon(addons);

    expect(result.replaced).toBe(false);
    expect(result.addons).toEqual(addons);
  });

  test('migrateUpstreamFatboyUnpackAddon leaves an upstream SteamRip entry untouched', () => {
    const addons = ['https://gitlab.com/fat-addons/steamrip-addon'];

    const result = migrateUpstreamFatboyUnpackAddon(addons);

    expect(result.replaced).toBe(false);
    expect(result.addons).toEqual(addons);
  });

  test('migrating both upstream entries in the same list replaces each with its own fork', () => {
    const steamripResult = migrateUpstreamSteamripAddon([
      'https://gitlab.com/fat-addons/steamrip-addon',
      'https://gitlab.com/fat-addons/fatboy-unpack',
    ]);
    expect(steamripResult.replaced).toBe(true);
    expect(steamripResult.addons).toEqual([
      `git@${STEAMRIP_ADDON_FORK_URL}`,
      'https://gitlab.com/fat-addons/fatboy-unpack',
    ]);

    const fatboyResult = migrateUpstreamFatboyUnpackAddon(
      steamripResult.addons
    );
    expect(fatboyResult.replaced).toBe(true);
    expect(fatboyResult.addons).toEqual([
      `git@${STEAMRIP_ADDON_FORK_URL}`,
      `git@${FATBOY_UNPACK_FORK_URL}`,
    ]);
  });
});

describe('DODI addon', () => {
  const dodiLink = `git@${DODI_ADDON_URL}`;

  test('appends the addon when absent', () => {
    expect(appendDodiAddon([])).toEqual({ addons: [dodiLink], appended: true });
  });

  test('does not duplicate across URL variants', () => {
    const variants = [
      DODI_ADDON_URL,
      `${DODI_ADDON_URL}.git`,
      `${DODI_ADDON_URL}/`,
      'https://GitHub.com/ShockStruck/DODI-Addon',
      `git@${DODI_ADDON_URL}.git`,
      `https://ogi-marketplace.nat3z.com@${DODI_ADDON_URL}`,
    ];
    for (const variant of variants) {
      const result = appendDodiAddon([variant]);
      expect(result).toEqual({ addons: [variant], appended: false });
    }
  });

  test('keeps every other entry, in order', () => {
    const others = [
      'git@https://github.com/shockstruck/steamrip-addon',
      'local:/home/user/my-addon',
      'git@https://github.com/shockstruck/fatboy-unpack',
    ];
    expect(appendDodiAddon(others).addons).toEqual([...others, dodiLink]);
  });

  test('a lookalike repository is not treated as DODI', () => {
    const other = 'git@https://github.com/shockstruck/dodi-addon-extra';
    expect(appendDodiAddon([other]).appended).toBe(true);
  });

  test('repair is needed only when configured and not cloned', () => {
    expect(needsDodiAddonRepair([dodiLink], false)).toBe(true);
    expect(needsDodiAddonRepair([`${DODI_ADDON_URL}.git`], false)).toBe(true);
    expect(needsDodiAddonRepair([dodiLink], true)).toBe(false);
    expect(needsDodiAddonRepair([], false)).toBe(false);
    expect(
      needsDodiAddonRepair(['git@https://github.com/shockstruck/fatboy-unpack'], false)
    ).toBe(false);
    expect(needsDodiAddonRepair(['local:/some/dodi-addon'], false)).toBe(false);
  });

  // The runner in migrations.ts applies a migration when
  // gte(lastVersion, from) && lt(lastVersion, to), then writes the running
  // VERSION to lastVersion.txt.
  const applies = (lastVersion: string) =>
    semver.gte(lastVersion, DODI_ADDON_MIGRATION_FROM) &&
    semver.lt(lastVersion, DODI_ADDON_MIGRATION_TO);

  test('the migrations run when upgrading from ss.16 and earlier', () => {
    expect(applies('4.3.1-ss.16')).toBe(true);
    expect(applies('4.3.1-ss.14')).toBe(true);
    expect(applies('0.0.0')).toBe(true);
  });

  test('the migrations do not run again once ss.17 has been recorded', () => {
    expect(applies('4.3.1-ss.17')).toBe(false);
    expect(applies('4.3.1-ss.18')).toBe(false);
    expect(applies('4.3.2')).toBe(false);
  });
});
