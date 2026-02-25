"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function LegacyAnalyzeRedirectPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    const target = `/analyze${qs ? `?${qs}` : ""}`;
    if (pathname !== "/sessions/analyze") return;
    router.replace(target);
  }, [pathname, router, searchParams]);

  return null;
}
