import Link from "next/link";
import { Logo } from "@naamdev/ui";
import { ProductImage } from "@/components/common/product-image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden overflow-hidden bg-surface-2 lg:block">
        <ProductImage src="/static/catalog/photos/motichoor-laddu.webp" alt="" className="absolute inset-0 h-full w-full object-cover" sizes={1000} priority />
        <div className="absolute inset-x-0 bottom-0 bg-maroon-900 p-10 text-cream-100">
          <p className="font-display text-3xl font-extrabold leading-tight">Fresh sweets and namkeen,<br />delivered from our kitchen.</p>
          <p className="mt-2 max-w-sm text-[15px] text-cream-200/80">Sign in to place orders, save addresses and follow your delivery live.</p>
        </div>
      </div>
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" className="w-fit"><Logo size="md" /></Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </div>
    </div>
  );
}
