'use client'
import type { OrderStatus } from '@prisma/client';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { DashboardEmptyState } from "../../_components/dashboard-states";
import { ShoppingBag } from "lucide-react";

// Define the type for a single order
type Order = {
  id: string | null;
  hash:string;
  name: string;
  date: string;
  total: string;
  status: OrderStatus;
};

// Define the props for the OrderList component
type OrderListProps = {
  orders: Order[];
  itemsPerPage?: number;
};

const OrderList: React.FC<OrderListProps> = ({ orders = [], itemsPerPage = 10 }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter()
  // Calculate total pages
  const totalPages = Math.ceil(orders.length / itemsPerPage);
  // Get current page orders
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentOrders = orders.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(totalPages, page)));
  };

  
  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case "PENDING":
        return 'bg-yellow-200 text-yellow-800';
      case "SHIPPED":
        return 'bg-blue-200 text-blue-800';
      case "COMPLETED":
        return 'bg-green-200 text-green-800';
      case "CANCELED":
        return 'bg-red-200 text-red-800';
      case "FAILED":
        return 'bg-red-200 text-red-800';
      default:
        return 'bg-gray-200 text-gray-800';
    }
  };

  const getStatusLabel = (status: Order["status"]) => {
    switch (status) {
      case "PENDING":
        return "Ausstehend";
      case "SHIPPED":
        return "Versendet";
      case "COMPLETED":
        return "Abgeschlossen";
      case "CANCELED":
        return "Storniert";
      case "FAILED":
        return "Fehlgeschlagen";
      default:
        return status;
    }
  };

  if (orders.length === 0) {
    return (
      <DashboardEmptyState
        icon={ShoppingBag}
        title="Keine Bestellungen vorhanden"
        description="Neue Bestellungen erscheinen hier automatisch mit Status, Betrag und Zeitverlauf."
      />
    );
  }

  return (
    <div className="w-full p-1">
      <h1 className="text-2xl font-bold mb-4">Bestellungen</h1>

      {/* Desktop Table View */}
      <div className="hidden md:block">
        <div className="content-card overflow-hidden">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="bg-pirrot-blue-100/60 border-b border-info-200 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-info-700">
                  Order ID
                </th>
                <th className="bg-pirrot-blue-100/60 border-b border-info-200 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-info-700">
                  Name
                </th>
                <th className="bg-pirrot-blue-100/60 border-b border-info-200 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-info-700">
                  Date
                </th>
                <th className="bg-pirrot-blue-100/60 border-b border-info-200 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-info-700">
                  Total
                </th>
                <th className="bg-pirrot-blue-100/60 border-b border-info-200 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-info-700">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {currentOrders.map((order, idx) => (
                <tr onClick={() => router.push(`/dashboard/orders/manage?pl=${order.hash}`)} key={idx} className="cursor-pointer hover:bg-pirrot-blue-50/55">
                  <td className="border-b border-info-200 bg-white/70 px-5 py-4 text-sm">
                    <p className="whitespace-nowrap text-info-900">{order.id}</p>
                  </td>
                  <td className="border-b border-info-200 bg-white/70 px-5 py-4 text-sm">
                    <p className="whitespace-nowrap text-info-900">{order.name}</p>
                  </td>
                  <td className="border-b border-info-200 bg-white/70 px-5 py-4 text-sm">
                    <p className="whitespace-nowrap text-info-900">{order.date}</p>
                  </td>
                  <td className="border-b border-info-200 bg-white/70 px-5 py-4 text-sm">
                    <p className="whitespace-nowrap text-info-900">{order.total}</p>
                  </td>
                  <td className="border-b border-info-200 bg-white/70 px-5 py-4 text-sm">
                    <span
                      className={`relative inline-block px-3 py-1 font-semibold leading-tight rounded-full ${getStatusColor(
                        order.status
                      )}`}
                    >
                      <span className="relative">{getStatusLabel(order.status)}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden">
        <div className="space-y-4">
          {currentOrders.map((order, key) => (
            <div key={key} className="content-card p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-lg">{order.id}</span>
                <span
                  className={`px-2 py-1 text-xs font-semibold leading-tight rounded-full ${getStatusColor(
                    order.status
                  )}`}
                >
                  {getStatusLabel(order.status)}
                </span>
              </div>
              <div className="border-t border-info-200 pt-2">
                <div className="flex justify-between text-sm text-info-600">
                  <span>Name:</span>
                  <span className="font-medium text-info-900">{order.name}</span>
                </div>
                <div className="flex justify-between text-sm text-info-600">
                  <span>Date:</span>
                  <span className="font-medium text-info-900">{order.date}</span>
                </div>
                <div className="flex justify-between text-sm text-info-600 mt-2 pt-2 border-t">
                  <span className="font-bold">Total:</span>
                  <span className="font-bold text-lg text-info-900">{order.total}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-3 flex flex-col items-center border-t border-info-200 px-5 py-5 xs:flex-row xs:justify-between">
          <span className="text-xs xs:text-sm text-info-900">
            Showing {Math.min(startIndex + 1, orders.length)} to {Math.min(endIndex, orders.length)} of {orders.length} Entries
          </span>
          <div className="inline-flex mt-2 xs:mt-0">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="btn-soft rounded-l px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Zurück
            </button>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="btn-soft rounded-r px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Weiter
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderList;
