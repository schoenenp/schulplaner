export async function readStorageAsset(): Promise<Response> {
  throw new Error("Private storage must be read through /api/cdn in browsers");
}
