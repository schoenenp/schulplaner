import { env } from "@/env";

// Define types for clarity
export interface FileItem {
  name: string;
  src: string;
  type: FileType;
  size: number;
  /** PDF page count captured at upload; absent for images. */
  pageCount?: number;
  /** CDN src of the print-quality grayscale variant, when one was created. */
  srcGrayscale?: string;
}

type FileType = "PDF" | "IMAGE_PNG" | "IMAGE_JPEG";

interface UploadResponse {
  files: FileData | FileData[];
}

interface FileData {
  fileName: string;
  originalName?: string;
  url: string;
  mimetype: string;
  size: number;
}

type UploadMode = "single" | "bulk";

export async function uploadData(
  files: {
    data: Buffer;
    name: string;
  }[],
): Promise<FileItem[]> {
  const UPLOAD_URL = env.UPLOAD_URL_LINK;
  const API_KEY = env.UPLOAD_API_KEY;

  // Validate environment variables
  if (!UPLOAD_URL || !API_KEY) {
    throw new Error(
      "Missing required environment variables: UPLOAD_URL_LINK or UPLOAD_API_KEY",
    );
  }
  // Validate input
  if (!files || (Array.isArray(files) && files.length === 0)) {
    return [];
  }

  const primaryMode: UploadMode = files.length > 1 ? "bulk" : "single";

  try {
    return await executeUpload(files, primaryMode, UPLOAD_URL, API_KEY);
  } catch (primaryError) {
    const primaryMessage =
      primaryError instanceof Error ? primaryError.message : "Unknown error";

    // The current single endpoint can fail on legacy storage schemas.
    // Retry once against bulk for single-file uploads.
    if (primaryMode === "single" && shouldRetryWithBulk(primaryMessage)) {
      try {
        return await executeUpload(files, "bulk", UPLOAD_URL, API_KEY);
      } catch (bulkError) {
        const bulkMessage =
          bulkError instanceof Error ? bulkError.message : "Unknown error";
        throw new Error(
          `Upload error: ${primaryMessage} | fallback bulk failed: ${bulkMessage}`,
        );
      }
    }

    throw new Error(`Upload error: ${primaryMessage}`);
  }
}

function shouldRetryWithBulk(errorMessage: string): boolean {
  return (
    errorMessage.includes("Upload failed: 500") &&
    (errorMessage.includes("File.thumbnail") ||
      errorMessage.includes("Failed to save files to database"))
  );
}

function buildFormData(
  files: { data: Buffer; name: string }[],
  mode: UploadMode,
) {
  const formData = new FormData();

  if (mode === "single") {
    if (files.length !== 1) {
      throw new Error("Single upload mode expects exactly one file");
    }
    const singleFile = files[0]!;
    const fileType = getFileTypeFromBuffer(singleFile.data);
    const preppedFile = new File(
      [singleFile.data as BlobPart],
      singleFile.name,
      {
        type: fileType ?? "application/pdf",
      },
    );
    formData.append("file", preppedFile, singleFile.name);
    return formData;
  }

  files.forEach((file) => {
    formData.append(
      "files",
      new File([file.data as BlobPart], file.name, {
        type: getFileTypeFromBuffer(file.data) ?? "",
      }),
      file.name,
    );
  });

  return formData;
}

async function executeUpload(
  files: { data: Buffer; name: string }[],
  mode: UploadMode,
  uploadUrl: string,
  apiKey: string,
): Promise<FileItem[]> {
  const response = await fetch(`${uploadUrl}${mode}`, {
    method: "post",
    headers: {
      "X-API-Key": apiKey,
    },
    body: buildFormData(files, mode),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Upload failed: ${response.status} |/| ${response.statusText} ?>> ${errorText}`,
    );
  }

  const { files: responseFiles } = (await response.json()) as UploadResponse;

  return (Array.isArray(responseFiles) ? responseFiles : [responseFiles]).map(
    (file) => ({
      size: file.size,
      name: file.originalName ?? file.fileName,
      src: file.url,
      type: getFileType(file.mimetype),
    }),
  );
}

function getFileType(mimeType: string): FileType {
  const mimeToFileType: Record<string, FileType> = {
    "application/pdf": "PDF",
    "image/png": "IMAGE_PNG",
    "image/jpeg": "IMAGE_JPEG",
    "image/jpg": "IMAGE_JPEG",
  };

  return mimeToFileType[mimeType] ?? "IMAGE_JPEG"; // Default to IMAGE_JPEG
}

function getFileTypeFromBuffer(buffer: Buffer): string | null {
  // Check the first 8 bytes for common file signatures
  const magicNumbers = buffer.subarray(0, 8).toString("hex").toLowerCase();

  // Common file signatures (hex) and their MIME types
  const signatures: Record<string, string> = {
    "89504e47": "image/png", // PNG: ‰PNG
    "25504446": "application/pdf", // PDF: %PDF
    ffd8ff: "image/jpeg", // JPEG: ÿØÿ
    "47494638": "image/gif", // GIF: GIF8
    "52494646": "image/webp", // WebP: RIFF (then check for WEBP later in the file)
    "504b0304": "application/zip", // ZIP (also used for .docx, .xlsx, etc.)
    "1f8b": "application/gzip", // GZIP
  };

  // Check for a match in the signatures
  for (const [signature, mimeType] of Object.entries(signatures)) {
    if (magicNumbers.startsWith(signature)) {
      // Special case for WebP: Confirm 'WEBP' in the RIFF container
      if (
        signature === "52494646" &&
        buffer.subarray(8, 12).toString("ascii") !== "WEBP"
      ) {
        continue;
      }
      return mimeType;
    }
  }

  return null; // Unknown file type
}
