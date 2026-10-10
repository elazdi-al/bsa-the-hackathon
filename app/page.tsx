"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { phone } from "@/lib/wallet/phone";

/** The app's front door: the wallet on this phone, or onboarding if it has none. */
export default function Index() {
  const router = useRouter();
  useEffect(() => router.replace(phone.hasWallet() ? "/home" : "/onboarding-welcome"), [router]);
  return null;
}
