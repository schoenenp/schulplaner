import type { BookPart } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import type { TagItem } from "@/app/dashboard/module/manage/_components/module-form";
import { logger } from "@/util/logger";

export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error as Error);
    });
  };


  export async function extractTextFields(
    fileData: File,
    allowedTags: TagItem[]
): Promise<{ 
    fields: TagItem[]; 
    modifiedPdf: Uint8Array 
}>{

    const arrayBuffer = await fileData.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
  
    const fileForm = pdfDoc.getForm();
    const fields = fileForm.getFields();
  
    const formFields: TagItem[] = [];
  
    for (const field of fields) {
      const fieldName = field.getName();
      // Find the matching tag
      const existingTag = allowedTags.find(
        tag => tag.name.toLowerCase() === fieldName.toLowerCase()
      );
      // Fill the form field if output exists
      if (existingTag) {
        formFields.push(existingTag);
            try {
              fileForm.getTextField(fieldName).setText(existingTag?.output ?? "BSP_TEXT");
            } catch (error) {
                logger.warn("pdf_form_text_set_failed", { fieldName, error });
            } finally{
         
            }
      }
    
    }
  
    const modifiedPdf = await pdfDoc.save();
    return { fields: formFields, modifiedPdf };
  }


export async function validatePDFUpload(
  file: string | ArrayBuffer | Uint8Array,
  part: BookPart
): Promise<{
  valid: boolean,
  message?: string,
  /** Parsed page count so callers can persist it without re-parsing. */
  pageCount?: number
 }>{

  try {
    const bookPart = part.toLocaleUpperCase()
    const tempDoc = await PDFDocument.load(file);
    const pageCount = tempDoc.getPageCount();
    switch (bookPart) {
      case "COVER":
        if (pageCount !== 4) {
          return { valid: false, message: "Der Umschlag muss 4 Seiten haben" };
        }
        break;
      case "PLANNER":
        if (pageCount < 2 || pageCount > 92) {
          return { valid: false, message: "Der Planer muss zwischen 2 und 92 Seiten haben" };
        }
        break;
      case "BINDING":
        if (pageCount >= 1) {
          return { valid: false, message: "Der Einband darf keine Seiten enthalten." };
        }
        break;
      default:
        if (pageCount < 1 || pageCount > 100) {
          return { valid: false, message: "Das Dokument muss mindestens 1 und höchstens 100 Seiten haben." };
        }
    }

    return { valid: true, pageCount };
  } catch (error) {
    logger.error("failed_to_process_pdf_upload", { error });
    return { valid: false, message: "Failed to process PDF file" };
  }
}

export const urlToFile = async (url: string, fileName: string) => {
    try {
        const targetUrl = /^https?:\/\//i.test(url)
          ? url
          : `https://cdn.pirrot.de${url}`;
        const response = await fetch(targetUrl);
        if (!response.ok) throw new Error(`Failed to fetch the file: ${response.status} ${response.statusText} ${JSON.stringify(response)}`);
        const blob = await response.blob();
        // Use the provided fileName or extract it from the URL
        const name = fileName ?? url.split('/').pop() ?? 'downloaded_file';
        // Get MIME type from response headers or fallback to generic type
        const mimeType = response.headers.get('content-type') ?? 'application/octet-stream';
        const file = new File([blob], name, { type: mimeType });
        return file;
      } catch (error) {
        logger.error("file_from_url_creation_failed", { url, error });
        return null;
      }
  };
