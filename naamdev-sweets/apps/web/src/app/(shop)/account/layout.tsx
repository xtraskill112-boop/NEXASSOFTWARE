"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { BrandLoader, cn } from "@naamdev/ui";
import { AccountNav } from "@/components/account/nav";
import { useAuth } from "@/lib/auth";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (user === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [user, router, pathname]);
  if (!user) return <BrandLoader className="min-h-[60dvh]" />;
  const isRoot = pathname === "/account";
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-28 pt-6 sm:px-6 lg:grid-cols-[260px_1fr]">
      <aside className={cn("hidden lg:block", isRoot && "hidden")}><div className="sticky top-24"><AccountNav /></div></aside>
      <div className={cn("min-w-0", isRoot && "lg:col-span-2")}>{children}</div>
    </div>
  );
}
