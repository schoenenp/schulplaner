"use client";

import { useActionState } from "react";
import { createPlanner } from "../actions";
import { SubmitButton } from "@/components/submit-button";

export function CreatePlannerButton({ label, secondary }: { label: string; secondary?: boolean }) {
  const [state, action] = useActionState(createPlanner, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <SubmitButton className={secondary ? "btn-secondary" : "btn-primary"} pendingText="Wird angelegt …">
        {label}
      </SubmitButton>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
