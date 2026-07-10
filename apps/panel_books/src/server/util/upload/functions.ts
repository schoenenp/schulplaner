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
  file?: FileData;
  files?: FileData | FileData[];
}

interface FileData {
  fileName: string;
  originalName?: string;
  url: string;
  mimetype: string;
  size: number;
}

const UPLOAD_URL = env.UPLOAD_URL_LINK;
const API_KEY = env.UPLOAD_API_KEY;

if (!UPLOAD_URL || !API_KEY) {
  throw new Error("Missing required environment variables.");
}
function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}
export async function uploadData(
  files: {
    data: Buffer;
    name: string;
  }[],
): Promise<FileItem[]> {
  if (!files || (Array.isArray(files) && files.length === 0)) {
    return [];
  }

  const createFormData = (mode: "single" | "bulk") => {
    const formData = new FormData();
    const fieldName = mode === "single" ? "file" : "files";

    files.forEach((file) => {
      const ab = bufferToArrayBuffer(file.data);
      const blob = new File([ab], file.name, {
        type: getFileTypeFromBuffer(file.data) ?? "",
      });
      formData.append(fieldName, blob, file.name);
    });

    return formData;
  };

  const mapUploadResponse = (responseData: unknown): FileItem[] => {
    if (typeof responseData !== "object" || responseData === null) {
      throw new Error("Invalid response format from upload API");
    }

    const parsed = responseData as UploadResponse;
    const fileEntries = parsed.files ?? parsed.file;
    const normalizedFiles = Array.isArray(fileEntries)
      ? fileEntries
      : fileEntries
        ? [fileEntries]
        : [];

    if (!normalizedFiles.length) {
      throw new Error("Invalid response format from upload API");
    }

    return normalizedFiles.map((file, index) => ({
      size: file.size,
      // Preserve request-side names (file_*/thumb_*) even if API omits originalName.
      name: file.originalName ?? files[index]?.name ?? file.fileName,
      src: file.url,
      type: getFileType(file.mimetype),
    }));
  };

  const uploadWithMode = async (mode: "single" | "bulk") => {
    const fetchLink = `${UPLOAD_URL}${mode}`;
    const response = await fetch(fetchLink, {
      method: "post",
      headers: {
        "X-API-Key": API_KEY,
      },
      body: createFormData(mode),
    });

    if (!response.ok) {
      throw new Error(
        `Upload failed: ${response.status} ${response.statusText}`,
      );
    }
    const responseData = (await response.json()) as unknown;
    return mapUploadResponse(responseData);
  };

  try {
    if (files.length === 1) {
      try {
        return await uploadWithMode("bulk");
      } catch (bulkError) {
        try {
          return await uploadWithMode("single");
        } catch (singleError) {
          throw new Error(
            `Single-file upload failed for bulk and single endpoints. bulk: ${bulkError instanceof Error ? bulkError.message : "Unknown error"}, single: ${singleError instanceof Error ? singleError.message : "Unknown error"}`,
          );
        }
      }
    }

    return await uploadWithMode("bulk");
  } catch (error) {
    throw new Error(
      `Upload error: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function getFileType(mimeType: string): FileType {
  const mimeToFileType: Record<string, FileType> = {
    "application/pdf": "PDF",
    "image/png": "IMAGE_PNG",
    "image/jpeg": "IMAGE_JPEG",
    "image/jpg": "IMAGE_JPEG",
  };

  return mimeToFileType[mimeType] ?? "IMAGE_JPEG";
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
