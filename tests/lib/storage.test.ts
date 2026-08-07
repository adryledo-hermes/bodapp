import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deletePhoto,
  ensurePhotoDir,
  getPhotoDir,
  photoFilePath,
  savePhoto,
} from "../../src/lib/storage";

let dir: string;
const ORIGINAL_ENV = process.env.PHOTO_STORAGE_DIR;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "bodapp-photos-"));
  process.env.PHOTO_STORAGE_DIR = dir;
});

afterEach(async () => {
  delete process.env.PHOTO_STORAGE_DIR;
  if (ORIGINAL_ENV !== undefined) process.env.PHOTO_STORAGE_DIR = ORIGINAL_ENV;
  await rm(dir, { recursive: true, force: true });
});

describe("getPhotoDir", () => {
  it("resolves the configured PHOTO_STORAGE_DIR", () => {
    expect(getPhotoDir()).toBe(dir);
  });
});

describe("photoFilePath traversal guard", () => {
  it("accepts a plain basename filename", () => {
    expect(photoFilePath("a1b2c3.png")).toBe(join(dir, "a1b2c3.png"));
  });

  it("rejects parent-directory traversal", () => {
    expect(() => photoFilePath("../secret.txt")).toThrow();
    expect(() => photoFilePath("a/../../etc/passwd")).toThrow();
  });

  it("rejects absolute paths", () => {
    expect(() => photoFilePath("/etc/passwd")).toThrow();
  });

  it("rejects empty filenames", () => {
    expect(() => photoFilePath("")).toThrow();
  });

  it("rejects dot / hidden filenames", () => {
    expect(() => photoFilePath(".")).toThrow();
    expect(() => photoFilePath(".hidden")).toThrow();
  });
});

describe("savePhoto / deletePhoto", () => {
  it("creates the dir on demand, writes the file, returns a safe filename", async () => {
    const filename = await savePhoto(Buffer.from("hello"), { id: "abc-123", ext: "png" });
    expect(filename).toBe("abc-123.png");
    expect(await readFile(join(dir, filename), "utf8")).toBe("hello");
  });

  it("deletePhoto removes the file", async () => {
    const filename = await savePhoto(Buffer.from("x"), { id: "del-1", ext: "jpg" });
    expect(await readdir(dir)).toContain(filename);
    await deletePhoto(filename);
    expect(await readdir(dir)).not.toContain(filename);
  });

  it("deletePhoto is a no-op when the file does not exist", async () => {
    await expect(deletePhoto("nope.png")).resolves.toBeUndefined();
  });

  it("savePhoto refuses an unsafe id/extension combo", async () => {
    await expect(
      savePhoto(Buffer.from("x"), { id: "..", ext: "png" })
    ).rejects.toThrow();
  });

  it("ensurePhotoDir creates the directory", async () => {
    await ensurePhotoDir();
    await writeFile(join(dir, "marker"), "ok");
    await expect(readFile(join(dir, "marker"), "utf8")).resolves.toBe("ok");
  });
});
