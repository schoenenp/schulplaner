import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ModulePlugin() {
  const router = useRouter();
  return (
    <div
      onClick={() => router.push("/dashboard/module")}
      className="group flex size-full cursor-pointer flex-col p-2"
    >
      <h2 className="text-2xl">Module</h2>
      <Link
        href="/dashboard/module"
        className="mt-auto transition duration-500 group-hover:text-pirrot-red-400"
      >
        Alle Module
      </Link>
    </div>
  );
}
