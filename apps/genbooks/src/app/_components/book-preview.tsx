import Image from "next/image";

type BookPreviewProps = {
  name?: string;
  bg?: string;
  sub?: string;
  coverThumbnail?: string | null;
  isLoading?: boolean;
  period: {
    start: string;
    end: string;
  };
};

export default function BookPreview(props: BookPreviewProps) {
  const { name, period, sub, coverThumbnail, isLoading } = props;
  const from = new Date(period.start).getFullYear();
  const to = new Date(period.end).getFullYear();

  if (isLoading && !coverThumbnail) {
    return (
      <div className="text-pirrot-blue-50 flex">
        <div className="from-pirrot-blue-500 to-pirrot-blue-700 border-pirrot-blue-200 border-l-pirrot-blue-950 drop-shadow-pirrot-blue-950/35 relative z-[1] flex aspect-5/7 w-3xs animate-pulse flex-col items-center rounded-l-md rounded-r-sm border border-r-2 border-b-2 border-l-4 bg-gradient-to-br pt-16 drop-shadow-lg">
          <div className="bg-pirrot-blue-950/80 border-pirrot-blue-900/50 z-1 flex w-3/4 flex-col gap-1.5 rounded border-2 p-2">
            <div className="bg-pirrot-blue-700/50 h-4 animate-pulse rounded" />
            <div className="bg-pirrot-blue-700/50 h-3 w-1/2 animate-pulse rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (coverThumbnail) {
    return (
      <div className="text-pirrot-blue-50 flex">
        <div className="from-pirrot-blue-500 to-pirrot-blue-700 border-pirrot-blue-200 border-l-pirrot-blue-950 animate-float drop-shadow-pirrot-blue-950/35 relative z-[1] flex aspect-5/7 w-3xs flex-col items-center rounded-l-md rounded-r-sm border border-r-2 border-b-2 border-l-4 bg-gradient-to-br pt-16 drop-shadow-lg">
          <i className="absolute top-0 -left-4 flex h-full flex-col items-center justify-between gap-4 py-3">
            {Array.from({ length: 19 }).map((_, idx) => (
              <b key={idx} className="z-[1] h-1 w-6 rounded-full bg-white"></b>
            ))}
          </i>
          <Image
            src={coverThumbnail}
            alt={`Cover preview for ${name}`}
            fill
            className="z-0 object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="text-pirrot-blue-50 flex">
      <div className="from-pirrot-blue-500 to-pirrot-blue-700 border-pirrot-blue-200 border-l-pirrot-blue-950 animate-float drop-shadow-pirrot-blue-950/35 relative z-[1] flex aspect-5/7 w-3xs flex-col items-center rounded-l-md rounded-r-sm border border-r-2 border-b-2 border-l-4 bg-gradient-to-br pt-16 drop-shadow-lg">
        <i className="absolute top-0 -left-4 flex h-full flex-col items-center justify-between gap-4 py-3">
          {Array.from({ length: 19 }).map((_, idx) => (
            <b key={idx} className="z-[1] h-1 w-6 rounded-full bg-white"></b>
          ))}
        </i>
        <div className="bg-pirrot-blue-950/80 border-pirrot-blue-900/50 z-1 flex w-3/4 flex-col gap-1.5 rounded border-2 p-2">
          <div className="flex flex-col">
            <h5 className="z-[1] text-base font-bold">{name}</h5>
            <p className="z-[1] text-xs font-bold">
              {from === to ? `${from}` : `${from}/${to}`}
            </p>
          </div>
          <h5 className="z-[1] w-full text-xs text-wrap">{sub}</h5>
        </div>
        <Image className="z-0" fill src="/assets/wood.png" alt="background" />
      </div>
    </div>
  );
}
