import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service.js';

const TEMPORARY_DIRECTORY_PREFIX = 'narrator-merge-';
const FINAL_AUDIO_FILENAME = 'final.mp3';
const CONCAT_MANIFEST_FILENAME = 'parts.ffconcat';

export type AudioPartToMerge = {
  position: number;
  objectKey: string;
};

export type MergedAudioFile = {
  filePath: string;
  byteSize: number;
  cleanup: () => Promise<void>;
};

export class AudioMergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = AudioMergeError.name;
  }
}

@Injectable()
export class AudioMergeService {
  constructor(private readonly storageService: StorageService) {}

  async merge(parts: AudioPartToMerge[]): Promise<MergedAudioFile> {
    const orderedParts = validateAndSortParts(parts);
    const workingDirectory = await mkdtemp(
      join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX),
    );

    try {
      const inputPaths = await this.downloadParts(
        orderedParts,
        workingDirectory,
      );
      const manifestPath = join(workingDirectory, CONCAT_MANIFEST_FILENAME);
      const finalAudioPath = join(workingDirectory, FINAL_AUDIO_FILENAME);

      await writeFile(manifestPath, toConcatManifest(inputPaths), 'utf8');
      await runFfmpeg(manifestPath, finalAudioPath);

      const finalAudio = await stat(finalAudioPath);

      if (!finalAudio.size) {
        throw new AudioMergeError('FFmpeg produced an empty audio file');
      }

      return {
        filePath: finalAudioPath,
        byteSize: finalAudio.size,
        cleanup: () => rm(workingDirectory, { recursive: true, force: true }),
      };
    } catch (error) {
      await rm(workingDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  private async downloadParts(
    parts: AudioPartToMerge[],
    workingDirectory: string,
  ): Promise<string[]> {
    const paths: string[] = [];

    for (const part of parts) {
      const partPath = join(
        workingDirectory,
        `${String(part.position).padStart(6, '0')}.mp3`,
      );
      const source = await this.storageService.getObjectStream(part.objectKey);

      await pipeline(source, createWriteStream(partPath, { flags: 'wx' }));
      paths.push(partPath);
    }

    return paths;
  }
}

function validateAndSortParts(parts: AudioPartToMerge[]): AudioPartToMerge[] {
  if (!parts.length) {
    throw new AudioMergeError('No audio parts are available to merge');
  }

  const positions = new Set<number>();

  for (const part of parts) {
    if (!Number.isSafeInteger(part.position) || part.position < 0) {
      throw new AudioMergeError('Audio part position is invalid');
    }

    if (!part.objectKey || positions.has(part.position)) {
      throw new AudioMergeError('Audio parts are invalid for merging');
    }

    positions.add(part.position);
  }

  return [...parts].sort((first, second) => first.position - second.position);
}

function toConcatManifest(inputPaths: string[]): string {
  return inputPaths.map((inputPath) => `file '${inputPath}'`).join('\n');
}

async function runFfmpeg(
  manifestPath: string,
  finalAudioPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        manifestPath,
        '-map',
        '0:a:0',
        '-c:a',
        'copy',
        '-f',
        'mp3',
        '-y',
        finalAudioPath,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    ffmpeg.stderr.resume();
    ffmpeg.once('error', () => {
      reject(new AudioMergeError('FFmpeg could not be started'));
    });
    ffmpeg.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new AudioMergeError('FFmpeg could not merge the audio parts'));
    });
  });
}
