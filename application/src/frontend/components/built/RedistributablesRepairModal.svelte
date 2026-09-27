<script lang="ts">
import type { LibraryInfo } from '@ogi-sdk/connect';
import { Effect } from 'effect';
import {
  ALLOWED_WINETRICKS_VERBS,
  type AllowedWinetricksVerb,
} from '@/electron/lib/winetricks-verbs';
import ButtonModal from '@/frontend/components/modal/ButtonModal.svelte';
import CheckboxModal from '@/frontend/components/modal/CheckboxModal.svelte';
import Modal from '@/frontend/components/modal/Modal.svelte';
import TextModal from '@/frontend/components/modal/TextModal.svelte';
import TitleModal from '@/frontend/components/modal/TitleModal.svelte';
import { runFrontendEffect } from '@/frontend/lib/core/runtime';
import { electronRpc } from '@/frontend/lib/electron-rpc';

const verbLabels: Record<AllowedWinetricksVerb, string> = {
  vcrun2022: 'Visual C++ 2015-2022 Libraries',
  dotnet48: '.NET Framework 4.8',
  dotnetdesktop6: '.NET Desktop Runtime 6.0',
  dotnetdesktop8: '.NET Desktop Runtime 8.0',
  xna40: 'XNA Framework 4.0',
  d3dx9: 'DirectX 9 (d3dx9_??.dll)',
  d3dcompiler_47: 'd3dcompiler_47.dll',
  physx: 'PhysX',
};

let {
  open = false,
  gameInfo,
  onClose,
}: {
  open?: boolean;
  gameInfo: LibraryInfo;
  onClose?: () => void;
} = $props();

let selectedVerbs = $state<Record<AllowedWinetricksVerb, boolean>>(
  Object.fromEntries(
    ALLOWED_WINETRICKS_VERBS.map((verb) => [verb, false])
  ) as Record<AllowedWinetricksVerb, boolean>
);
let running = $state(false);
let resultMessage = $state<string | null>(null);
let resultIsError = $state(false);

$effect(() => {
  if (!open) return;
  selectedVerbs = Object.fromEntries(
    ALLOWED_WINETRICKS_VERBS.map((verb) => [verb, false])
  ) as Record<AllowedWinetricksVerb, boolean>;
  resultMessage = null;
  resultIsError = false;
});

let recordedRedistributables = $derived(gameInfo.redistributables ?? []);
let hasAnyVerbSelected = $derived(
  ALLOWED_WINETRICKS_VERBS.some((verb) => selectedVerbs[verb])
);
let canReinstall = $derived(
  !running && (recordedRedistributables.length > 0 || hasAnyVerbSelected)
);

function toggleVerb(id: string, checked: boolean) {
  selectedVerbs = { ...selectedVerbs, [id]: checked };
}

function describeResult(
  result: 'success' | 'partial' | 'failed' | 'not-found' | 'busy'
): { message: string; isError: boolean } {
  switch (result) {
    case 'success':
      return {
        message: 'Redistributables reinstalled successfully.',
        isError: false,
      };
    case 'partial':
      return {
        message:
          'Some redistributables failed to reinstall. Check notifications for details.',
        isError: true,
      };
    case 'not-found':
      return {
        message: 'This game could not be found in the library.',
        isError: true,
      };
    case 'busy':
      return {
        message: 'A repair for this game is already running.',
        isError: true,
      };
    default:
      return {
        message: 'Failed to reinstall redistributables.',
        isError: true,
      };
  }
}

async function runRepair() {
  if (!canReinstall) return;
  running = true;
  resultMessage = null;
  resultIsError = false;
  try {
    const extraVerbs = ALLOWED_WINETRICKS_VERBS.filter(
      (verb) => selectedVerbs[verb]
    );
    const result = await runFrontendEffect(
      electronRpc.app
        .repairRedistributables(gameInfo.appID, extraVerbs)
        .pipe(Effect.catchAll(() => Effect.succeed('failed' as const)))
    );
    const described = describeResult(result);
    resultMessage = described.message;
    resultIsError = described.isError;
  } finally {
    running = false;
  }
}
</script>

{#if open}
  <Modal open={true} size="large" priority="urgent" {onClose}>
    <TitleModal title="Redistributables" />
    <TextModal
      text="Reinstall this game's recorded redistributables, or reinstall common runtimes without reinstalling the game."
      variant="description"
      class="mb-4"
    />

    <TextModal text="Recorded redistributables" variant="caption" class="mb-2" />
    {#if recordedRedistributables.length > 0}
      <ul class="recorded-list mb-4">
        {#each recordedRedistributables as redistributable (redistributable.path + redistributable.name)}
          <li>
            <span class="font-semibold">{redistributable.name}</span>
            <span class="text-text-secondary">
              ({redistributable.path === 'winetricks' ? 'winetricks verb' : 'installer file'})
            </span>
          </li>
        {/each}
      </ul>
    {:else}
      <TextModal
        text="No redistributables are recorded for this game."
        variant="small"
        class="mb-4"
      />
    {/if}

    <TextModal text="Common runtimes" variant="caption" class="mb-2" />
    <div class="verb-grid mb-4">
      {#each ALLOWED_WINETRICKS_VERBS as verb (verb)}
        <CheckboxModal
          id={verb}
          label={verbLabels[verb]}
          checked={selectedVerbs[verb]}
          disabled={running}
          onchange={toggleVerb}
        />
      {/each}
    </div>

    {#if resultMessage}
      <TextModal
        text={resultMessage}
        variant={resultIsError ? 'warning' : 'body'}
        class="mb-4"
      />
    {/if}

    <div class="pt-4 flex flex-row gap-3">
      <ButtonModal
        text={running ? 'Reinstalling…' : 'Reinstall'}
        variant="primary"
        disabled={!canReinstall}
        onclick={runRepair}
      />
      <ButtonModal text="Close" variant="secondary" onclick={onClose} disabled={running} />
    </div>
  </Modal>
{/if}

<style>
  @reference "../../app.css";

  .recorded-list {
    @apply w-full max-h-40 overflow-y-auto overscroll-contain border border-border rounded-lg px-3 py-2 text-sm;
  }

  .recorded-list li {
    @apply py-1;
  }

  .verb-grid {
    @apply grid grid-cols-1 sm:grid-cols-2 gap-2;
  }
</style>
