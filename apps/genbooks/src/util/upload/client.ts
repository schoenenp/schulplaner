import {
  MAX_UPLOAD_FILE_BYTES,
  uploadLimitMessage,
} from "@/util/upload/limits";

export type UploadedModuleFile = {
  name?: string | null;
  src: string;
  type: "PDF" | "IMAGE_PNG" | "IMAGE_JPEG";
  size: number;
};

/**
 * Sends the raw files as multipart/form-data to /api/module-files, which
 * validates them and forwards them to the storage API. Keeps file bytes
 * binary end-to-end (no base64 inflation).
 */
export async function uploadModuleFiles(input: {
  type: string;
  file?: File;
  thumbnail?: File;
}): Promise<{
  file?: UploadedModuleFile;
  thumbnail?: UploadedModuleFile;
}> {
  if (!input.file && !input.thumbnail) return {};

  for (const file of [input.file, input.thumbnail]) {
    if (file && file.size > MAX_UPLOAD_FILE_BYTES) {
      throw new Error(uploadLimitMessage(file.name));
    }
  }

  const formData = new FormData();
  formData.set("type", input.type);

  if (input.file) {
    formData.set("file", input.file);
  }

  if (input.thumbnail) {
    formData.set("thumbnail", input.thumbnail);
  }

  const response = await fetch("/api/module-files", {
    method: "POST",
    body: formData,
  });

  const responseData = (await response.json()) as {
    message?: string;
    file?: UploadedModuleFile;
    thumbnail?: UploadedModuleFile;
  };

  if (!response.ok) {
    throw new Error(responseData.message ?? "File upload failed");
  }

  return responseData;
}
