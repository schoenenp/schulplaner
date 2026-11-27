BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE "SchoolOrderDetails" (
    "orderId" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "priceBookVersion" INTEGER NOT NULL,
    "schoolName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "billingAddress" JSONB NOT NULL,
    "shippingAddress" JSONB NOT NULL,
    "customerNote" TEXT,
    "invoiceNumber" TEXT,

    CONSTRAINT "SchoolOrderDetails_pkey" PRIMARY KEY ("orderId")
);

CREATE UNIQUE INDEX "SchoolOrderDetails_requestId_key" ON "SchoolOrderDetails"("requestId");

ALTER TABLE "SchoolOrderDetails" ADD CONSTRAINT "SchoolOrderDetails_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
