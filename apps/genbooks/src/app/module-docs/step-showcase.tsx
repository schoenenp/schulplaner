'use client'

import Image from "next/image";
import { useState } from "react";

type Step = {
  title: string;
  text: string;
  image: string;
  alt: string;
};

export default function ModuleDocsStepShowcase({
  steps,
}: {
  steps: readonly Step[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeStep = steps[activeIndex];

  if (!activeStep) {
    return null;
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, index) => {
          const isActive = index === activeIndex;

          return (
            <button
              key={step.title}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`field-shell flex h-full w-full flex-col items-start gap-3 p-4 text-left transition ${isActive
                ? "border-pirrot-red-200 bg-pirrot-red-50/70 shadow-sm"
                : "hover:border-pirrot-blue-200 hover:bg-white/90"
                }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex size-9 items-center justify-center rounded-full text-sm font-black ${isActive
                    ? "bg-pirrot-red-500 text-white"
                    : "bg-pirrot-red-100 text-pirrot-red-600"
                    }`}
                >
                  {index + 1}
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.08em] text-pirrot-red-500">
                    Schritt {index + 1}
                  </p>
                </div>
              </div>
              <p className="text-sm leading-6 text-info-700">{step.text}</p>
            </button>
          );
        })}
      </div>

      <div className="h-px bg-pirrot-blue-100/80" />

      <article className="field-shell w-full overflow-hidden">
        <div className="relative aspect-[16/10] w-full bg-slate-100">
          <Image
            src={activeStep.image}
            alt={activeStep.alt}
            fill
            className="object-contain object-top"
            sizes="100vw"
            priority
          />
          <div className="absolute right-4 top-4 rounded-full bg-white/95 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-pirrot-red-600 shadow-sm">
            Screenshot zu Schritt {activeIndex + 1}
          </div>
        </div>
      </article>
    </div>
  );
}
