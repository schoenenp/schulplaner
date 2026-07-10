'use client'
import Link from "next/link"
import Countdown from "@/app/_components/countdown"
import { useEffect, useState } from "react"

import LoadingSpinner from "@/app/_components/loading-spinner"
import { api } from "@/trpc/react"

export default function CancelOrder({payload}:{payload:string}) {
    const [bookPayload, setBookPayload] = useState<string>()
    const cancelOrder = api.order.cancelByUser.useMutation({
        onSuccess: data => { 
            setBookPayload(data)
        }
    })
   
   useEffect(() => {
    async function cleanPayload(){       
        cancelOrder.mutate({ encryptedPayload: payload })
    }
        void cleanPayload()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    },[payload])


    if(!bookPayload){
        return <div className="size-full flex flex-col gap-2 justify-center items-center pt-12 text-pirrot-red-400">
            <LoadingSpinner />
        </div>
    }

    return <div className="size-full flex flex-col gap-2 justify-center items-center pt-12">
    <h1 className="text-2xl uppercase font-bold text-pirrot-red-400">Abbruch!</h1>
    <p className="w-full max-w-xl">Der Bezahlvorgang wurde abgebrochen, ihre Bestellung wird nicht fortgesetzt. Sie werden in <Countdown redirect={`/config?bookId=${bookPayload}`} /> Sekunden zum <Link className="underline font-semibold" href={`/config?bookId=${bookPayload}`}>{" Konfigurator "}</Link> weitergeleitet.</p>
    </div>
}