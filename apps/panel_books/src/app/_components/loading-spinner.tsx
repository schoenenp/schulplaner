import { ArrowPathIcon } from "@heroicons/react/16/solid";

export default function LoadingSpinner() {
  return (
    <div className="flex size-full items-center justify-center p-2">
      <ArrowPathIcon className="size-8 animate-spin" />
    </div>
  );
}
