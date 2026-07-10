import Link from "next/link";
import { useRouter } from "next/navigation";

export default function TipsPlugin() {
  const router = useRouter();
  return (
    <div
      onClick={() => router.push("/dashboard/tips")}
      className="group flex size-full cursor-pointer flex-col p-2"
    >
      <h2 className="text-2xl">Tooltips</h2>
      <Link
        href="/dashboard/tips"
        className="mt-auto transition duration-500 group-hover:text-pirrot-red-400"
      >
        Alle Tooltips
      </Link>
    </div>
  );
}
