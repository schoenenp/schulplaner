"use client";
import LoadingSpinner from "@/app/_components/loading-spinner";
import React, { useState } from "react";

const defaultPlugins = ["module", "variablen", "typen", "tips"];

export default function PluginRouter(props: { plugins: string[] }) {
  const { plugins } = props;

  const [pluginsAvailable] = useState<string[]>(plugins);
  const [loadedPlugins, setLoadedPlugins] = useState<string[]>(defaultPlugins);

  function togglePlugin(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const pluginName = event.currentTarget.id;

    const isActive = loadedPlugins.includes(pluginName);

    if (isActive) {
      const newPlugins = loadedPlugins.filter((p) => p !== pluginName);
      setLoadedPlugins(newPlugins);
    } else {
      setLoadedPlugins((prevPlugins) => [...prevPlugins, pluginName]);
    }
  }

  function handleClosePlugin(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const pluginIndex = parseInt(event.currentTarget.id);
    const filteredPlugins = loadedPlugins.filter(
      (_, idx: number) => idx !== pluginIndex,
    );
    setLoadedPlugins(filteredPlugins);
  }

  return (
    <div className="bg-tappen-blue-900 flex w-full flex-col items-center justify-center gap-8 pb-12">
      <div className="flex w-full items-center justify-center bg-pirrot-blue-600">
        <div className="flex w-full gap-0.5">
          {pluginsAvailable.map((pluginName) => (
            <button
              className={`p-2 px-5 ${loadedPlugins.includes(pluginName) ? "bg-pirrot-blue-900/80" : "bg-pirrot-blue-900/50"}`}
              onClick={togglePlugin}
              id={pluginName}
              key={pluginName}
            >
              {pluginName}
            </button>
          ))}
        </div>
      </div>
      <div className="flex w-full items-center justify-center p-4">
        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {loadedPlugins.map((pluginName, idx: number) => {
            const Plugin = React.lazy(() => import(`../${pluginName}`));
            return (
              <div
                key={idx}
                className="relative col-span-1 aspect-video rounded border-2 border-pirrot-blue-900 bg-pirrot-blue-800/90 shadow shadow-pirrot-blue-950/10"
              >
                <button
                  className="text-tappen-blue-100/50 absolute right-3 top-1 inline-block cursor-pointer text-xl"
                  id={idx.toString()}
                  onClick={handleClosePlugin}
                >
                  x
                </button>
                <React.Suspense fallback={<LoadingSpinner />}>
                  <Plugin />
                </React.Suspense>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
