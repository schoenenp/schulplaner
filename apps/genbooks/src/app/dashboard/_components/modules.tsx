import ModuleGrid from "@/app/dashboard/module/_components/module-grid";

export default function ModulesSection () {
    return <div className="content-card rise-in relative flex flex-1 flex-col gap-4 p-4 lg:min-h-96">
    <h2 className="text-2xl uppercase font-bold">Modulübersicht</h2>
    <ModuleGrid />
        </div>
}
