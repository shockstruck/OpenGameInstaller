import { createLogger, LOGGER_PREFIXES } from '@ogi-sdk/logger';
import { accessSync, constants } from 'fs';
import { isAbsolute } from 'path';

const logger = createLogger(LOGGER_PREFIXES.electron);

export const OGI_UMU_RUN_ENV = 'OGI_UMU_RUN';

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve which `umu-run` OGI should invoke.
 *
 * When `OGI_UMU_RUN` is set to an absolute, executable path, that override
 * wins — it lets a packager (e.g. the NixOS build) point OGI at an
 * FHS-wrapped `umu-run` instead of the zipapp OGI downloads and manages
 * itself. Otherwise this returns `bundledPath` unchanged, so behaviour off
 * that variable is byte-for-byte what it always was.
 */
export function resolveUmuRunExecutable(
  bundledPath: string,
  env: NodeJS.ProcessEnv = process.env,
  isExecutable: (path: string) => boolean = isExecutableFile
): string {
  const override = env[OGI_UMU_RUN_ENV];
  if (!override) {
    return bundledPath;
  }

  if (!isAbsolute(override)) {
    logger.sync.warn(
      `[umu] ${OGI_UMU_RUN_ENV} is set but not an absolute path (${override}); falling back to the bundled umu-run`
    );
    return bundledPath;
  }

  if (!isExecutable(override)) {
    logger.sync.warn(
      `[umu] ${OGI_UMU_RUN_ENV} is set but not an executable file (${override}); falling back to the bundled umu-run`
    );
    return bundledPath;
  }

  logger.sync.info(`[umu] using external umu-run: ${override}`);
  return override;
}

/** Whether `OGI_UMU_RUN` is in effect, so OGI's own umu self-management can be skipped. */
export function hasUmuRunOverride(
  env: NodeJS.ProcessEnv = process.env,
  isExecutable: (path: string) => boolean = isExecutableFile
): boolean {
  const override = env[OGI_UMU_RUN_ENV];
  return !!override && isAbsolute(override) && isExecutable(override);
}
