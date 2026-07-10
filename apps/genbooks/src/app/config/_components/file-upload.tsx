'use client'
import { CheckCircleIcon, UploadCloud } from 'lucide-react';
import { useRef, useCallback, useState } from 'react';

type FileUploadProps = {
  onPickedFile: (file: File) => void
  accept?: string[]
  resetFile: () => void
  fieldName: string
};

export default function FileUpload({ 
  fieldName,
  onPickedFile, 
  accept = [],
  resetFile 
}: FileUploadProps ) {

  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [hasFile, setHasFile] = useState<File | null>();

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const files = event.dataTransfer?.files;
      const file = files?.[0];
      if (file) {
        setHasFile(file);
        onPickedFile(file);
      }
    },
    [onPickedFile]
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    event.stopPropagation();


    const file = event.target.files?.[0];
    if (file) {
      setHasFile(file);
      onPickedFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }

  if (hasFile) {
    return (
      <div
        onClick={() => {
          setHasFile(null);
          resetFile()
          if (uploadRef.current) uploadRef.current.value = ''; // Clear input
        }}
        className="size-full group cursor-pointer border-solid border-info-800 text-info-800 hover:border-info-50/20 bg-info-500/20 transition duration-500 rounded-sm border-2 flex flex-col justify-center items-center relative"
      >
        <span className="absolute hidden transition duration-500 group-hover:block text-pirrot-red-400 top-2 right-2">
          undo
        </span>
        <CheckCircleIcon className="size-8" />
        <span>{hasFile?.name}</span> {/* Optional: Display file name */}
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => uploadRef.current?.click()}
      className="size-full group cursor-pointer hover:border-solid border-info-100/50 text-info-500/20 hover:text-info-800 hover:border-info-50/20 hover:bg-info-500/20 transition duration-500 rounded-sm border-2 border-dashed flex flex-col justify-center items-center"
    >
      <UploadCloud className="size-8" />
      <span>{fieldName}</span>
      <input
        className="hidden"
        accept={accept.join(", ")}
        onChange={handleChange}
        ref={uploadRef}
        type="file"
      />
    </div>
  );
}