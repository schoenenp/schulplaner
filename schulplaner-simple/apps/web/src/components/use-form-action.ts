"use client";

import { startTransition, useActionState, type FormEvent } from "react";

type State = { error?: string; ok?: string } | undefined;

/**
 * useActionState without React's automatic form reset, so a validation
 * error does not wipe what the user typed.
 */
export function useFormAction(action: (state: State, formData: FormData) => Promise<State>) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }
  return { state, pending, onSubmit };
}
