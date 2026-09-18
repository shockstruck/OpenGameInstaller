import { FileSystemError } from '@ogi-sdk/errors';
import { createLogger, LOGGER_PREFIXES } from '@ogi-sdk/logger';
import { Effect } from 'effect';
import { basename } from '@/frontend/lib/core/fs';
import { electronRpc } from '@/frontend/lib/electron-rpc';

const logger = createLogger(LOGGER_PREFIXES.frontend);

const fsEffect = <A>(
  operation: Effect.Effect<A, unknown>,
  message: string,
  path?: string
): Effect.Effect<A, FileSystemError> =>
  operation.pipe(
    Effect.mapError((cause) => new FileSystemError({ message, path, cause }))
  );

/**
 * Picks the first volume of a (possibly multi-volume) RAR set from a list of
 * file names, name-based only — never opens a file to read its header.
 *
 * Order of preference:
 * 1. `.partN.rar` volumes: the lowest N.
 * 2. Old-style `.rNN` volumes alongside a `.rar`: the `.rar` (the first volume).
 * 3. A single `.rar` candidate.
 * 4. Several unrelated `.rar` candidates: the lexicographically first, logged.
 */
export function selectRarVolume(names: string[]): string | null {
  const rarCandidates = names.filter((name) => /\.rar$/i.test(name));
  if (rarCandidates.length === 0) return null;

  const partVolumes = rarCandidates
    .map((name) => {
      const match = name.match(/\.part(\d+)\.rar$/i);
      return match ? { name, part: Number.parseInt(match[1], 10) } : null;
    })
    .filter(
      (volume): volume is { name: string; part: number } => volume !== null
    );
  if (partVolumes.length > 0) {
    partVolumes.sort((a, b) => a.part - b.part);
    return partVolumes[0].name;
  }

  const hasOldStyleVolumes = names.some((name) => /\.r\d{2}$/i.test(name));
  if (hasOldStyleVolumes) {
    return rarCandidates[0];
  }

  if (rarCandidates.length === 1) return rarCandidates[0];

  const chosen = [...rarCandidates].sort()[0];
  logger.sync.warn(
    'Multiple .rar files with no volume pattern; picking the lexicographically first:',
    chosen,
    'from',
    rarCandidates
  );
  return chosen;
}

/** Resolves a RAR path from a direct file, downloaded directory, or file metadata. */
export function resolveRarArchivePath(
  downloadPath: string,
  filesMeta?: { name: string }[]
) {
  const trimmed = downloadPath.replace(/[\/\\]+$/, '');
  const base = basename(trimmed);
  if (/\.rar$/i.test(base)) {
    return Effect.succeed<string | null>(trimmed);
  }

  const fromFilesMeta = (): string | null => {
    const chosen = selectRarVolume(filesMeta?.map((file) => file.name) ?? []);
    return chosen ? `${trimmed}/${chosen}` : null;
  };

  return fsEffect(
    electronRpc.fs.getFilesInDir(trimmed),
    'Failed to inspect the downloaded directory.',
    trimmed
  ).pipe(
    Effect.map((files) => {
      const chosen = selectRarVolume(files);
      return chosen ? `${trimmed}/${chosen}` : fromFilesMeta();
    }),
    Effect.catchAll(() => Effect.succeed(fromFilesMeta()))
  );
}

export function drillDownSingleDirectories(
  startDir: string,
  maxDepth: number = 10
) {
  return Effect.gen(function* () {
    let currentDir = startDir;
    let filesInDir = yield* fsEffect(
      electronRpc.fs.getFilesInDir(currentDir),
      'Failed to inspect extraction output.',
      currentDir
    );

    for (let depth = 0; filesInDir.length === 1 && depth < maxDepth; depth++) {
      const nextPath = `${currentDir}/${filesInDir[0]}`;
      const stat = yield* Effect.try({
        try: () => window.electronAPI.fs.stat(nextPath),
        catch: (cause) =>
          new FileSystemError({
            message: 'Failed to inspect extracted path.',
            path: nextPath,
            cause,
          }),
      });
      if (!stat?.isDirectory) break;
      currentDir = nextPath;
      filesInDir = yield* fsEffect(
        electronRpc.fs.getFilesInDir(currentDir),
        'Failed to inspect extraction output.',
        currentDir
      );
    }

    return currentDir;
  }).pipe(
    Effect.tapError((error) =>
      logger.error('Failed to traverse directories from:', startDir, error)
    ),
    Effect.catchAll(() => Effect.succeed(startDir))
  );
}

export function unrarAndReturnOutputDir(params: {
  rarFilePath: string;
  outputBaseDir: string;
  downloadId: string;
}) {
  const { rarFilePath, outputBaseDir, downloadId } = params;
  return Effect.gen(function* () {
    yield* logger.info(
      'Extracting RAR file:',
      rarFilePath,
      'to',
      outputBaseDir
    );
    const extractedDir = yield* fsEffect(
      electronRpc.fs.unrar({
        outputDir: outputBaseDir,
        rarFilePath,
        downloadId,
      }),
      'Failed to extract RAR file.',
      rarFilePath
    );
    yield* Effect.try({
      try: () => window.electronAPI.fs.delete(rarFilePath),
      catch: (cause) =>
        new FileSystemError({
          message: 'Failed to delete extracted RAR file.',
          path: rarFilePath,
          cause,
        }),
    }).pipe(
      Effect.tapError((error) =>
        logger.error(error.message, rarFilePath, error.cause)
      ),
      Effect.ignore
    );
    return extractedDir;
  });
}

export function unzipAndReturnOutputDir(params: {
  zipFilePath: string;
  outputDirBase: string;
  downloadId: string;
}) {
  const { zipFilePath, outputDirBase, downloadId } = params;
  return Effect.gen(function* () {
    yield* logger.info('Extracting ZIP file:', zipFilePath);
    const queriedOutput = yield* fsEffect(
      electronRpc.fs.unzip({
        zipFilePath,
        outputDir: outputDirBase,
        downloadId,
      }),
      'Failed to extract ZIP file.',
      zipFilePath
    );
    if (!queriedOutput) return undefined;

    const outputDir = `${yield* drillDownSingleDirectories(queriedOutput, 10)}/`;
    yield* Effect.try({
      try: () => window.electronAPI.fs.delete(zipFilePath),
      catch: (cause) =>
        new FileSystemError({
          message: 'Failed to delete extracted ZIP file.',
          path: zipFilePath,
          cause,
        }),
    }).pipe(
      Effect.tapError((error) =>
        logger.error(error.message, zipFilePath, error.cause)
      ),
      Effect.ignore
    );
    return outputDir;
  });
}
