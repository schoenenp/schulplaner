'use client'
import { api } from "@/trpc/react"
import { useEffect, useState } from "react"
import LoadingSpinner from "./loading-spinner"

export default function TooltipFader(props:{ tooltips: string[] }){
    const { tooltips } = props
    const [isFading, setIsFading] = useState(false)
    
    const {data:tips, isLoading} = api.tip.getCurrent.useQuery({
        tips: tooltips.map(t => t.toLocaleLowerCase())
    },{
        enabled: tooltips?.length >= 1
    })

    const [currentIdx, setCurrentIdx] = useState(0)

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsFading(true)
            setTimeout(() => {
            setCurrentIdx(prev => prev + 1 >= tooltips.length ? 0 : prev + 1)
            setIsFading(false)
            }, 1000)
        }, 10 * 1000)
        
        return () => clearTimeout(timer)
        
    },[tooltips.length])

    const currentTip = tips?.[currentIdx]

    if(!tips || isLoading || !currentTip) {
        return <div className={`w-48 aspect-[5/7] flex justify-center items-center border-2 border-info-950 rounded-sm p-2`}><LoadingSpinner />
        </div>
    }

    return <div className={`w-full md:max-w-48 aspect-[5/7] transition flex flex-col gap-2 border shadow border-info-50 bg-info-100/50 rounded-sm p-2 duration-1000 ${isFading ? "opacity-0" : "opacity-100"}`}>
        <h5 className="text-2xl md:text-xl font-bold font-cairo first-letter:uppercase">{currentTip.title}</h5>
        <p className="font-baloo text-xl md:text-sm">{currentTip.tip}</p>
    </div>
}