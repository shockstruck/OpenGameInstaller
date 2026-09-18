export type LaunchDispatchMode = 'hook' | 'wrapper' | 'umu' | 'direct';

/**
 * Pure cold-start dispatch decision for GameLaunchOverlay: given what the
 * launch request carries, pick which of the four launch flows to run.
 * `hookOnly` wins outright (no game launch involved); otherwise a wrapper
 * command or UMU library data route to their dedicated flows, and anything
 * left over — no wrapper, no UMU — falls back to a direct launch instead of
 * erroring out.
 */
export function decideLaunchDispatch(params: {
  hasWrapper: boolean;
  hasUmu: boolean;
  hookOnly: boolean;
}): LaunchDispatchMode {
  if (params.hookOnly) return 'hook';
  if (params.hasWrapper) return 'wrapper';
  if (params.hasUmu) return 'umu';
  return 'direct';
}
