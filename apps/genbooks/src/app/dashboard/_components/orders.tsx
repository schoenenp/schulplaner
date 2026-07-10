'use client'
import { api } from "@/trpc/react"
import OrderList from "../orders/_components/order-list"
import Link from "next/link"
import { DashboardEmptyState } from "./dashboard-states"
import { Receipt } from "lucide-react"

function getOrderStatusLabel(status: string): string {
    switch (status) {
        case "PENDING":
            return "Ausstehend"
        case "SHIPPED":
            return "Versendet"
        case "COMPLETED":
            return "Abgeschlossen"
        case "CANCELED":
            return "Storniert"
        case "FAILED":
            return "Fehlgeschlagen"
        default:
            return status
    }
}

export default function OrdersSection () {
    const [ordersData] = api.order.initSection.useSuspenseQuery()
    const {all, latest} = ordersData

  
    return <div className="content-card rise-in relative flex flex-1 flex-col gap-4 p-4 lg:min-h-96">
    <h2 className="text-2xl uppercase font-bold">Bestellübersicht</h2>
    <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
        Hier können Sie den aktuellen Status Ihrer letzten Bestellungen einsehen und bestehende Adressen bearbeiten.
        </div>
        <div className="field-shell flex-1 overflow-hidden aspect-video p-1">
        <div className="size-full flex justify-between flex-col">
        <h3 className="text-xl font-bold">Letzte Bestellung:</h3>
        {latest ? <ul className="stagger-item">
            <li>{latest?.name}</li>
            <li>{getOrderStatusLabel(latest.status)}</li>
            <li>{latest?.date}</li>
        </ul> : <DashboardEmptyState
          icon={Receipt}
          title="Keine Bestellung gefunden"
          description="Sobald eine Bestellung erstellt wurde, erscheint sie hier mit aktuellem Status."
          className="min-h-0 border-0 bg-transparent shadow-none p-2"
        />}
        <div>
            {latest ? (
            <Link href={`/dashboard/orders/manage?pl=${latest.hash}`} className="btn-soft inline-flex px-3 py-1 text-sm font-semibold">
                Ansehen
            </Link>
            ) : null}
        </div>
        </div>
        </div>
        <div className="field-shell flex-1 aspect-video p-2">Adressen</div>
    </div>
    <OrderList orders={all} />
        </div>
}
