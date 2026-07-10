'use client'

import LoadingSpinner from "@/app/_components/loading-spinner"
import { api } from "@/trpc/react"
import Image from "next/image"

export default function ModulePreview(props:{moduleId: string}){
    const moduleData = api.module.getPreview.useQuery({
        mid: props.moduleId,
    })

    if(!moduleData.data && moduleData.isLoading){
        return <LoadingSpinner />
    } 

    const rawPreview = moduleData.data
    const previewImage =
        typeof rawPreview === "string" && rawPreview.length > 0
            ? rawPreview === "/default.png" || /^https?:\/\//i.test(rawPreview)
                ? rawPreview
                : `https://cdn.pirrot.de${rawPreview}`
            : "/default.png"

    return <div className="relative size-full h-[420px]">
        <Image
            className={"object-cover"}
            alt="preview"
            fill
            sizes="(max-width: 768px) 100vw, 720px"
            src={previewImage}
        />
    </div>
}
