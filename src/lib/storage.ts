import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

/**
 * Local-disk photo storage helpers (Task 12).
 *
 * Photos are stored on the local filesystem (not in `public/` because they are
 * private to the wedding). The storage root is configurable via the
 * `PHOTO_STORAGE_DIR` env var so deployments can point it at a writable volume;
 * it defaults to `<project>/storage/photos`.
 *
 * These helpers are pure-ish (fs only, no Prisma) so they are unit-testable
 * against a temp directory.
 */

const DEFAULT_PHOTO_DIR = resolve(process.cwd(), "storage", "photos");

/** Resolve the photo storage directory (env override or project default). */
export function getPhotoDir(): string {
  const env = process.env.PHOTO_STORAGE_DIR;
  return env ? resolve(env) : DEFAULT_PHOTO_DIR;
}

/**
 * Resolve a stored filename to an absolute path under the photo dir.
 * Guards against path traversal / absolute paths / empty names — a crafted
 * filename can never escape the storage root.
 * @throws if the filename is not a safe bare basename.
 */
export function photoFilePath(filename: string): string {
  if (typeof filename !== "string" || filename.length === 0) {
    throw new Error("invalid filename");
  }
  const base = basename(filename);
  // A path separator anywhere means the caller tried to escape the dir.
  if (base !== filename) {
    throw new Error("invalid filename");
  }
  // Reject "." / ".." and hidden (dot-prefixed) names.
  if (base === "." || base === ".." || base.startsWith(".")) {
    throw new Error("invalid filename");
  }
  return join(getPhotoDir(), base);
}

/** Create the photo directory (mkdir -p). Safe to call repeatedly at runtime. */
export async function ensurePhotoDir(): Promise<void> {
  await mkdir(getPhotoDir(), { recursive: true });
}

/**
 * Write a photo buffer to disk as `<id>.<ext>` and return the stored filename.
 * Normalizes/validates the extension so the returned name is always a safe
 * bare basename.
 * @throws on unsafe id/ext or filesystem errors.
 */
export async function savePhoto(
  buffer: Buffer,
  opts: { id: string; ext: string }
): Promise<string> {
  const rawExt = opts.ext.replace(/^\./, "").toLowerCase();
  if (!/^[a-z0-9]+$/i.test(rawExt)) {
    throw new Error("invalid extension");
  }
  const id = String(opts.id ?? "");
  // Validate the full name via photoFilePath so traversal is impossible.
  const filename = photoFilePath(`${id}.${rawExt}`);
  const fileNameOnly = basename(filename);

  await ensurePhotoDir();
  await writeFile(join(getPhotoDir(), fileNameOnly), buffer);
  return fileNameOnly;
}

/**
 * Remove a photo file if it exists. No-op when the file is absent.
 * @throws on unsafe filenames (traversal guard) or non-ENOENT fs errors.
 */
export async function deletePhoto(filename: string): Promise<void> {
  const filePath = photoFilePath(filename);
  await unlink(filePath).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "ENOENT") throw err;
  });
}

/** Read a photo's bytes back from disk. */
export async function readPhoto(filename: string): Promise<Buffer> {
  return readFile(photoFilePath(filename));
}
