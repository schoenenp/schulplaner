"use client";

import Image from "next/image";
import { ImageOff, LoaderCircle } from "lucide-react";
import { useState } from "react";

export default function TemplateCoverPreview({
  src,
  name,
  isLoading,
}: {
  src: string | null;
  name: string;
  isLoading: boolean;
}) {
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const pending = isLoading || (!!src && !isImageLoaded && !hasError);

  return (
    <div className="absolute inset-6" aria-busy={pending}>
      {src && !hasError && (
        <Image
          src={src}
          alt={`Covervorschau: ${name}`}
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className={`object-contain transition-opacity duration-300 motion-reduce:transition-none ${isImageLoaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setIsImageLoaded(true)}
          onError={() => setHasError(true)}
        />
      )}
      {pending ? (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-gray-600"
        >
          <LoaderCircle
            aria-hidden="true"
            className="h-6 w-6 animate-spin motion-reduce:animate-none"
          />
          <span>Vorschau wird geladen …</span>
        </div>
      ) : !src || hasError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-sm text-gray-600">
          <ImageOff aria-hidden="true" className="h-6 w-6" />
          <span>Keine Covervorschau verfügbar</span>
        </div>
      ) : null}
    </div>
  );
}
