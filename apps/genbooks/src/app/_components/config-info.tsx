"use client";
import { api } from "@/trpc/react";
import { Regions } from "@/util/book/regions";
import { formatDisplayDate } from "@/util/date";
export default function ConfigInfo(props: { bid?: string }) {
  const { bid } = props;
  if (!bid) return null;
  const [configData] = api.book.getById.useSuspenseQuery({ id: bid });
  if (!configData) return null;

  const { name, region, bookTitle, subTitle, planEnd, planStart } = configData;

  return (
    <div className="content-card w-full max-w-md p-4">
      <ul className="flex flex-col gap-8">
        <li className="flex flex-col gap-1.5">
          <h3 className="text-2xl font-bold">Projekt Name:</h3>
          <h5 className="font-baloo flex flex-col text-xl">{name}</h5>
        </li>
        <li className="flex flex-col gap-8 lg:flex-row">
          <div className="flex flex-1 flex-col gap-1.5">
            <h3 className="text-2xl font-bold">Buchtitel:</h3>
            <h5 className="font-baloo flex flex-col text-xl">{bookTitle}</h5>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <h3 className="text-2xl font-bold">Untertitel:</h3>
            <h5 className="font-baloo flex flex-col text-xl">{subTitle}</h5>
          </div>
        </li>

        <li className="flex flex-col gap-8 lg:flex-row">
          <div className="flex flex-1 flex-col gap-1.5">
            <h5 className="text-2xl font-bold">Schuljahr:</h5>
            <div className="font-baloo flex flex-col text-xl">
              <span>Anfang: {formatDisplayDate(planStart)}</span>
              <span>Ende: {planEnd ? formatDisplayDate(planEnd) : ""}</span>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            <h3 className="text-2xl font-bold">Region:</h3>
            <h5 className="font-baloo flex flex-col text-xl">
              {Regions.find((r) => r.code === region)?.land}
            </h5>
          </div>
        </li>
      </ul>
    </div>
  );
}
