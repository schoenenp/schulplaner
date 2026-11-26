import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { storageKey } from "./references";

// The ignore comments keep Next's output tracing from bundling the whole
// project because of these runtime paths; the driver never runs in production.

/**
 * Development-only driver: STORAGE_DRIVER=local keeps objects on disk so the
 * app runs without object storage credentials. Production always uses S3.
 */
export function isLocalStorage(): boolean {
  const driver = process.env.STORAGE_DRIVER?.trim();
  return driver === "local" || driver === "volume";
}

function localRoot(): string {
  if (process.env.STORAGE_DRIVER?.trim() === "volume") {
    const root = process.env.STORAGE_LOCAL_DIR?.trim();
    if (!root || !isAbsolute(root) || !statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error("STORAGE_DRIVER=volume requires an existing absolute mount directory");
    }
    return root;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("STORAGE_DRIVER=local is not allowed in production");
  }
  return resolve(/*turbopackIgnore: true*/ process.env.STORAGE_LOCAL_DIR?.trim() || ".local-storage");
}

function localFile(src: string): string {
  return join(/*turbopackIgnore: true*/ localRoot(), storageKey(src));
}

export async function writeLocalObject(src: string, data: Uint8Array, contentType: string) {
  const file = localFile(src);
  await mkdir(/*turbopackIgnore: true*/ dirname(file), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ file, data);
  await writeFile(/*turbopackIgnore: true*/ `${file}.type`, contentType);
}

export async function readLocalObject(src: string): Promise<Response> {
  const file = localFile(src);
  try {
    const [data, info] = await Promise.all([
      readFile(/*turbopackIgnore: true*/ file),
      stat(/*turbopackIgnore: true*/ file),
    ]);
    const contentType = await readFile(/*turbopackIgnore: true*/ `${file}.type`, "utf8").catch(() => "application/octet-stream");
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(info.size),
        "Cache-Control": "private, no-cache, must-revalidate",
        "Last-Modified": info.mtime.toUTCString(),
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
