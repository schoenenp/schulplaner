"use client";
import { api } from "@/trpc/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function VariablePlugin() {
  const router = useRouter();
  const { data: varsDetail, isLoading } = api.tag.getDetail.useQuery();

  return (
    <div
      onClick={() => router.push("/dashboard/variablen")}
      className="group flex size-full cursor-pointer flex-col justify-between p-2"
    >
      <h2 className="text-2xl">Variablen</h2>
      {!isLoading && varsDetail && (
        <div className="flex w-full justify-evenly">
          <div className="flex flex-col items-center justify-center">
            <span className="text-3xl">{varsDetail?.all}</span>
            <span>insg.</span>
          </div>
          <div className="flex flex-col items-center justify-center">
            <span className="text-3xl">{varsDetail?.live}</span>
            <span>online</span>
          </div>
        </div>
      )}
      <Link
        href="/dashboard/variablen"
        className="transition duration-500 group-hover:text-pirrot-red-400"
      >
        Alle Variablen
      </Link>
    </div>
  );
}
