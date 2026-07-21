"use client";
import Modal from "@/app/_components/modal";
import { PencilIcon, PlusIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import { api } from "@/trpc/react";
import type { TagStatus, TagType } from "db";
import { useRouter } from "next/navigation";

type TagFormInputs = {
  name: string;
  desc: string;
  output: string;
  type: TagType;
  status: TagStatus;
  allowedIn: number[];
};

const defaultTagInputs: TagFormInputs = {
  name: "DEFAULT_TAG",
  desc: "",
  output: "",
  type: "DEFAULT",
  status: "UNRELEASED",
  allowedIn: [],
};

type TagFormProps = {
  existingTag?: TagFormInputs & { id: number };
};

export default function CreateOrUpdateTag(props: TagFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const utils = api.useUtils();
  const [formState, setFormState] = useState<TagFormInputs>(
    props.existingTag ?? defaultTagInputs,
  );

  const createTag = api.tag.create.useMutation({
    onSuccess: async () => {
      await utils.tag.invalidate();
      setFormState(defaultTagInputs);
      setIsOpen(false);
      router.refresh();
    },
  });

  const updateTag = api.tag.update.useMutation({
    onSuccess: async () => {
      await utils.tag.invalidate();
      setIsOpen(false);
      router.refresh();
    },
  });

  function handleOpenModal() {
    setFormState(props.existingTag ?? defaultTagInputs);
    setIsOpen(true);
  }

  function handleSubmitTagForm(e: React.FormEvent) {
    e.preventDefault();
    if (props.existingTag) {
      updateTag.mutate({ ...formState, id: props.existingTag.id });
      return;
    }
    createTag.mutate(formState);
  }
  return (
    <>
      <Modal show={isOpen} selector="modal-hook">
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-pirrot-blue-950/90 p-3 sm:p-4">
          <form
            onSubmit={handleSubmitTagForm}
            className="glass-card my-auto w-full max-w-xl text-pirrot-blue-50"
          >
            <div className="flex items-center justify-between gap-3 border-b border-pirrot-blue-200/10 px-4 py-4 sm:px-5">
              <h2 className="text-xl font-black text-white sm:text-2xl">Tag</h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="btn-secondary shrink-0 px-2 py-2"
              >
                <XMarkIcon className="size-5" />
              </button>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <div className="flex w-full flex-col gap-2">
                <label className="text-sm font-semibold text-pirrot-blue-100">
                  Name
                </label>
                <input
                  className="soft-input"
                  id="name"
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      [e.target.id]: e.target.value,
                    }))
                  }
                  value={formState.name}
                />
              </div>
              <div className="grid w-full gap-4 md:grid-cols-2">
                <div className="flex w-full flex-col gap-2">
                  <label className="text-sm font-semibold text-pirrot-blue-100">
                    Typ
                  </label>
                  <select
                    className="soft-input"
                    id="type"
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        [e.target.id]: e.target.value as TagType,
                      }))
                    }
                    value={formState.type}
                  >
                    {["FUNCTION", "DEFAULT", "CONFIG"].map((o, k) => (
                      <option key={k} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex w-full flex-col gap-2">
                  <label className="text-sm font-semibold text-pirrot-blue-100">
                    Status
                  </label>
                  <select
                    className="soft-input"
                    id="status"
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        [e.target.id]: e.target.value as TagStatus,
                      }))
                    }
                    value={formState.status}
                  >
                    {["RELEASED", "UNRELEASED", "BETA"].map((o, k) => (
                      <option key={k} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex w-full flex-col gap-2">
                <label className="text-sm font-semibold text-pirrot-blue-100">
                  Beschreibung
                </label>
                <textarea
                  className="soft-input min-h-28"
                  placeholder="Erklärung zum Tag"
                  id="desc"
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      [e.target.id]: e.target.value,
                    }))
                  }
                  value={formState.desc}
                />
              </div>
              <div className="flex w-full flex-col gap-2">
                <label className="text-sm font-semibold text-pirrot-blue-100">
                  Output
                </label>
                <input
                  className="soft-input"
                  placeholder="Beispiel Ausgabe"
                  id="output"
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      [e.target.id]: e.target.value,
                    }))
                  }
                  value={formState.output}
                />
              </div>
              <button className="btn-primary" type="submit">
                Speichern
              </button>
            </div>
          </form>
        </div>
      </Modal>
      {props.existingTag ? (
        <button
          onClick={handleOpenModal}
          type="button"
          className="btn-secondary px-2 py-2"
          aria-label={`${props.existingTag.name} bearbeiten`}
        >
          <PencilIcon className="size-5" />
        </button>
      ) : (
        <button
          onClick={handleOpenModal}
          type="button"
          className="btn-primary w-full gap-2"
        >
          <PlusIcon className="size-5" /> Variable anlegen
        </button>
      )}
    </>
  );
}
