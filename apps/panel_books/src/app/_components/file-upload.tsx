import { CheckCircleIcon, CloudArrowUpIcon } from "@heroicons/react/16/solid";
import { useRef, useCallback, useState } from "react";

type FileUploadProps = {
  onPickedFile: (file: File) => void;
  accept?: string[];
  resetFile: () => void;
  fieldName: string;
};

export default function FileUpload({
  fieldName,
  onPickedFile,
  accept = [],
  resetFile,
}: FileUploadProps) {
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
    [onPickedFile],
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

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  if (hasFile) {
    return (
      <div
        onClick={() => {
          setHasFile(null);
          resetFile();
          if (uploadRef.current) uploadRef.current.value = ""; // Clear input
        }}
        className="group relative flex size-full cursor-pointer flex-col items-center justify-center rounded-lg border border-solid border-pirrot-blue-200/20 bg-pirrot-blue-950/55 px-4 text-center text-pirrot-blue-100 transition hover:border-pirrot-blue-300/30 hover:bg-pirrot-blue-900/70"
      >
        <span className="absolute right-2 top-2 hidden text-pirrot-red-400 transition duration-500 group-hover:block">
          undo
        </span>
        <CheckCircleIcon className="size-8" />
        <span className="mt-3 max-w-full break-words font-semibold">
          {hasFile?.name}
        </span>
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => uploadRef.current?.click()}
      className="group flex size-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-pirrot-blue-200/25 px-4 text-center text-pirrot-blue-100/75 transition hover:border-solid hover:border-pirrot-blue-300/35 hover:bg-pirrot-blue-900/70 hover:text-white"
    >
      <CloudArrowUpIcon className="size-8" />
      <span className="mt-3 max-w-full break-words font-semibold">
        {fieldName}
      </span>
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
