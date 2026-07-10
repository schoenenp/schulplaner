'use client'

import { fileToBase64 } from "@/util/pdf/functions"
import Image from "next/image"
import { useEffect, useState } from "react"

export default function PreviewImage(props: { file?: string | File }) {
    const [previewUrl, setPreviewUrl] = useState<string>("/default.png")

    useEffect(() => {
        const loadPreview = async () => {
            if (!props.file) {
                setPreviewUrl("/default.png")
                return
            }

            if (typeof props.file === "string" && props.file.startsWith("/storage")) {
                setPreviewUrl(`https://cdn.pirrot.de${props.file}`)
                return
            }

            if (props.file && typeof props.file !== "string") {
                const base64 = await fileToBase64(props.file)
                setPreviewUrl(base64)
                return
            }

            setPreviewUrl("/default.png")
        }

        void loadPreview()
    }, [props.file])

    return (
        <div className="size-full p-4 overflow-hidden aspect-square relative">
            <Image 
                className="object-cover p-4" 
                src={previewUrl} 
                fill 
                alt="preview" 
            />
        </div>
    )
}