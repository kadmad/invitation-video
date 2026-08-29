/**
 * One place that decides whether an audio file is usable, so the admin picking
 * a template soundtrack and the customer replacing it are held to the same
 * rules. They were not: the customer probed the file in the browser and
 * explained the problem before uploading, while the admin uploaded first and
 * found out from a 400.
 */

/** Mirrors the extension whitelist in backend upload_template_music. Keeping
 *  the two in step is the point — `audio/*` alone lets a browser offer formats
 *  the server then rejects after a full upload. */
export const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".opus", ".flac"] as const;

/** Given to <input accept>. The extension list is what actually narrows the
 *  OS file dialog; `audio/*` is kept alongside it so a file with the right
 *  type but an unusual extension is still offered. */
export const AUDIO_ACCEPT = [...AUDIO_EXTENSIONS, "audio/*"].join(",");

export interface AudioCheck {
  /** Length in seconds. 0 when the file could not be read. */
  duration: number;
  /** Set when the file is unusable — the caller must not upload it. */
  error?: string;
  /** Set when the file works but the result won't be what they expect. */
  notice?: string;
}

export function formatMmSs(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Cheap, synchronous gate: is this even an audio file? Drag-and-drop ignores
 *  the input's `accept` entirely, so without this a dropped .mov or .pdf went
 *  all the way to the server before anything objected. */
export function isAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  const name = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Read the file's duration in the browser and judge it against the video it
 * has to cover. Resolves rather than rejects — every outcome is something to
 * show the person, not an exception to handle.
 */
export function checkAudioFile(file: File, videoDurationSeconds: number): Promise<AudioCheck> {
  return new Promise((resolve) => {
    if (!isAudioFile(file)) {
      resolve({
        duration: 0,
        error: `That's not an audio file. Use ${AUDIO_EXTENSIONS.join(", ")}.`,
      });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = "metadata";

    const done = (result: AudioCheck) => {
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    probe.onloadedmetadata = () => {
      const duration = probe.duration;
      if (!isFinite(duration) || duration <= 0) {
        done({ duration: 0, error: "Couldn't read that audio file." });
        return;
      }
      // A short track is allowed, not rejected — it just runs out and the tail
      // of the video is silent. Saying so beats refusing the song they picked.
      const shortfall = videoDurationSeconds - duration;
      done({
        duration,
        notice:
          shortfall > 1
            ? `This song is ${formatMmSs(duration)} and the video runs ${formatMmSs(
                videoDurationSeconds
              )}, so the last ${formatMmSs(shortfall)} will be silent.`
            : undefined,
      });
    };

    probe.onerror = () => done({ duration: 0, error: "Couldn't read that audio file." });
    probe.src = objectUrl;
  });
}
