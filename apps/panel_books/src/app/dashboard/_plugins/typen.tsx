import Link from "next/link";
import { useRouter } from "next/navigation";

export default function TypesPlugin() {
  const router = useRouter();
  return (
    <div
      onClick={() => router.push("/dashboard/types")}
      className="group flex size-full cursor-pointer flex-col p-2"
    >
      <h2 className="text-2xl">Typen</h2>
      <Link
        href="/dashboard/types"
        className="mt-auto transition duration-500 group-hover:text-pirrot-red-400"
      >
        Alle Typen
      </Link>
    </div>
  );
}
