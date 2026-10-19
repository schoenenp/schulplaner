import { createHmac, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";

type UploadReference = {
  src: string;
  srcGrayscale?: string | null;
  uploadProof?: string;
  name?: string | null;
  type?: string;
  size?: number;
  pageCount?: number | null;
};
function signature(file: UploadReference, userId: string, expires: number) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for private uploads");
  return createHmac("sha256", secret)
    .update(
      JSON.stringify([
        "cdn-upload-v1",
        userId,
        file.src,
        file.srcGrayscale ?? null,
        file.name ?? null,
        file.type ?? null,
        file.size ?? null,
        file.pageCount ?? null,
        expires,
      ]),
    )
    .digest("hex");
}
export function signFileUpload<T extends UploadReference>(
  file: T,
  userId: string,
): T & { uploadProof: string } {
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  return {
    ...file,
    uploadProof: `${expires}.${signature(file, userId, expires)}`,
  };
}
export function verifyFileUpload<T extends UploadReference>(
  file: T,
  userId: string,
): Omit<T, "uploadProof"> {
  const match = /^(\d+)\.([a-f0-9]{64})$/.exec(file.uploadProof ?? "");
  const expires = Number(match?.[1]);
  if (
    !match ||
    !Number.isSafeInteger(expires) ||
    expires < Date.now() ||
    !timingSafeEqual(
      Buffer.from(match[2]!, "hex"),
      Buffer.from(signature(file, userId, expires), "hex"),
    )
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "File was not uploaded by this user or the upload proof expired",
    });
  }
  const metadata = { ...file };
  delete metadata.uploadProof;
  return metadata;
}
