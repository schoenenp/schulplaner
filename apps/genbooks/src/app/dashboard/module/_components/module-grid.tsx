'use client'

import { PlusIcon, TrashIcon, ChevronLeftIcon, ChevronRightIcon, Component } from "lucide-react"
import { useRouter } from "next/navigation"
import { api } from "@/trpc/react"
import { useState } from "react"
import Modal from "@/app/_components/modal"
import { DashboardEmptyState } from "../../_components/dashboard-states"

export default function ModuleGrid(){

    const [items ] = api.module.getUserModules.useSuspenseQuery()
    const [deleteError, setDeleteError] = useState<string | undefined>()
    const [currentPage, setCurrentPage] = useState(1)
    const router = useRouter()

    const ITEMS_PER_PAGE = 11
    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    const currentItems = items.slice(startIndex, endIndex)

    const util = api.useUtils()
    const deleteType = api.module.delete.useMutation({
        onSuccess:async () => {
            await util.module.invalidate()
        }
    })

    function handleDeleteType(e: React.MouseEvent<HTMLButtonElement>){
        e.preventDefault()
        e.stopPropagation()
        const deleteId = e.currentTarget.id
        deleteType.mutate({id:deleteId})
    }

    const handlePrevPage = () => {
        setCurrentPage(prev => Math.max(prev - 1, 1))
    }

    const handleNextPage = () => {
        setCurrentPage(prev => Math.min(prev + 1, totalPages))
    }

    return <div className="w-full">
        <Modal selector="modal-hook" show={deleteError !== undefined}>
            <div className="size-full flex z-[69] justify-center items-center bg-info-950/95 absolute top-0 left-0">
                <div className="w-full max-w-xl rounded-xl bg-pirrot-blue-50 p-2 text-info-950 flex flex-col gap-2 lg:p-4 border border-pirrot-blue-100/80">
                <h3>Error</h3>
                <p>{deleteError}</p>
                <button type="button" onClick={() => setDeleteError(undefined)}>Ok</button>
                </div>
            </div>
        </Modal>
        <div className="w-full"></div>
        <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <div onClick={() => router.push("/dashboard/module/manage")} className="content-card cursor-pointer w-full aspect-video flex justify-center items-center p-1 text-pirrot-blue-500 hover:text-pirrot-blue-700">
                <PlusIcon className="size-8" />
            </div>
            {currentItems.map((item, index) => <div className="field-shell stagger-item w-full p-4 cursor-pointer gap-4 aspect-video flex" key={item.id} style={{ animationDelay: `${index * 55}ms` }}>
                <div className="flex-1 flex flex-col gap-2">
  <h3 className="truncate text-xl font-bold uppercase max-w-40">{item.name}</h3>
                        <p className="uppercase text-sm font-light"><b className="font-bold">TYP:</b> {item.type}</p>
                    <div className="flex gap-2 mt-auto">
                        <button onClick={() => router.push(`/dashboard/module/manage?moduleId=${item.id}`)} className="btn-soft uppercase p-1 px-3 rounded text-xs">bearbeiten</button>
                        <button id={item.id} type="button" onClick={handleDeleteType} className="btn-soft uppercase p-1 px-3 rounded text-xs"><TrashIcon className="size-6" /></button>
                    </div>
                </div>
            </div>)}
        </div>

        {items.length === 0 && (
            <div className="mt-4">
                <DashboardEmptyState
                    icon={Component}
                    title="Noch keine Module"
                    description="Legen Sie Ihr erstes Modul an, um es später Planern zuzuweisen."
                    actionHref="/dashboard/module/manage"
                    actionLabel="Modul erstellen"
                />
            </div>
        )}
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
        <div className="mt-6 flex justify-center items-center gap-4">
            <button 
                onClick={handlePrevPage}
                disabled={currentPage === 1}
                className="btn-solid flex items-center gap-2 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <ChevronLeftIcon className="size-5" />
                Previous
            </button>
            <span className="text-pirrot-blue-950">
                Page {currentPage} of {totalPages}
            </span>
            <button 
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="btn-solid flex items-center gap-2 px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Next
                <ChevronRightIcon className="size-5" />
            </button>
        </div>
        )}
    </div>
}
