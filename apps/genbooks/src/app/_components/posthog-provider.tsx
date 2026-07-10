"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

export function PostHogClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!posthogKey || !posthogHost) return;

    posthog.init(posthogKey, {
      api_host: posthogHost,
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
    });
  }, []);

  useEffect(() => {
    if (!posthogKey || !posthogHost) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a");
      if (!anchor) return;

      posthog.capture("link_clicked", {
        href: anchor.href,
        text: anchor.textContent?.trim() ?? "",
        current_path: window.location.pathname,
      });
    };

    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
    };
  }, []);

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
