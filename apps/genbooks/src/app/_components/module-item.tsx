'use client'
import Image from "next/image"
import Modal from "./modal";
import { useState } from "react";
import { MinusIcon, PlusIcon, XIcon } from "lucide-react";
import ModulePreview from "./module-preview";

export type ModulePickerItem = {
  id: string;
  name: string;
  theme: string | null;
  thumbnail?: string | null;
  type: string;
  part: string;
}

export type ModuleItemProps = {
  item: ModulePickerItem;
  onPickedItem: (pickedItem: { id: string; type: string }) => void;
  isPicked: boolean;
  isDisabled?: boolean;
  disabledReason?: string;
}

export default function ModuleItem(props: ModuleItemProps) {
  const { id, thumbnail, name, theme, type } = props.item
  const [isPickingModule, setIsPickingModule] = useState(false)
  const [
    thumbnailUrl,
    setThumbnailUrl
  ] = useState(thumbnail)

  const handleImageError = () => {
    setThumbnailUrl("/default.png");
  }

  function handlePickedModule(event: React.FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (props.isDisabled) return
    setIsPickingModule(false)
    props.onPickedItem({ id, type })
  }

  const getIndicatorColor = (moduleType: string) => {
    switch (moduleType) {
      case "umschlag":
        return "var(--color-pirrot-blue-300)"
      case "wochenplaner":
        return "var(--color-pirrot-green-300)"
      case "bindung":
        return "var(--color-warning-300)"
      case "custom":
        return "var(--color-pirrot-red-300)"
      default:
        if (theme !== null && theme === "custom") {
          return "var(--color-pirrot-red-300)"
        }
        return "var(--color-pirrot-red-300)"
    }
  }

  const pickedStyle = props.isPicked
    ? { outline: `2px solid ${getIndicatorColor(type.toLocaleLowerCase())}` }
    : undefined

  const accentColorClass = (() => {
    switch (type.toLocaleLowerCase()) {
      case "umschlag":
        return "bg-pirrot-blue-300"
      case "wochenplaner":
        return "bg-pirrot-green-300"
      case "bindung":
        return "bg-warning-300"
      default:
        return "bg-pirrot-red-300"
    }
  })()

  const themeBadgeClass =
    theme === "custom"
      ? "bg-pirrot-red-100/90 text-pirrot-red-700"
      : "bg-pirrot-blue-50/90 text-pirrot-blue-900"

  return <>
    <Modal selector="modal-hook" show={isPickingModule && !props.isDisabled}>
      <div className="absolute top-0 left-0 z-[69] flex size-full items-center justify-center bg-info-950/90">
        <div className="content-card pointer-events-none z-[69] w-full max-w-xl p-4 text-pirrot-blue-950 font-bold">
          <form onSubmit={handlePickedModule} className="pointer-events-auto flex w-full flex-col gap-3">
            <div className="w-full flex justify-between items-center">
              <h3 className="text-xl">{name}</h3>
              <button onClick={() => setIsPickingModule(false)} type="button" className="btn-soft p-2 text-pirrot-blue-900">
                <XIcon />
              </button>
            </div>
            <div className="field-shell flex h-full w-full items-center justify-center rounded">
              <ModulePreview moduleId={id} />
            </div>
            <div>
              {props.isPicked ? <button className="btn-soft flex w-full items-center justify-between gap-2 p-2"><MinusIcon /> Abwählen </button> : <button className="btn-solid flex w-full items-center justify-between gap-2 p-2"> <PlusIcon /> Auswählen</button>}
            </div>
          </form>
        </div>
      </div>
    </Modal>
    <div
      onClick={() => {
        if (props.isDisabled) return
        setIsPickingModule(true)
      }}
      title={props.isDisabled ? props.disabledReason : undefined}
      style={pickedStyle}
      className={`content-card stagger-item group relative flex min-w-0 select-none flex-col justify-between gap-2 overflow-hidden shadow-sm transition duration-300 ${props.isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:-translate-y-1 hover:shadow-lg"}`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${accentColorClass}`} />
      <div className="flex flex-col gap-2 p-3 pb-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-info-800 text-[11px] font-bold uppercase tracking-[0.16em] first-letter:uppercase">
              {type}
            </p>
            <h3 className="mt-1 truncate text-base font-bold">{name}</h3>
          </div>
          {props.isPicked ? (
            <span className="bg-pirrot-green-100 text-pirrot-green-700 rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide">
              Aktiv
            </span>
          ) : null}
        </div>
        {theme !== null ? (
          <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${themeBadgeClass}`}>
            {theme}
          </span>
        ) : null}
      </div>
      {props.isDisabled && props.disabledReason ? (
        <p className="absolute z-10 flex size-full items-center justify-center rounded-2xl bg-pirrot-blue-950/35 px-3 text-center text-base font-bold text-warning-50 backdrop-blur-[2px]">{props.disabledReason}</p>
      ) : null}
      <div className="relative flex aspect-video w-full items-end-safe justify-end rounded-[1rem] p-3 pt-1 transition-colors duration-300">
        <Image className="rounded-[1rem] object-cover"
          src={thumbnailUrl && thumbnailUrl !== null ? thumbnailUrl : "/default.png"}
          priority={false}
          onError={handleImageError}
          alt={name}
          sizes="420"
          fill
        />
      </div>
    </div>
  </>
}
