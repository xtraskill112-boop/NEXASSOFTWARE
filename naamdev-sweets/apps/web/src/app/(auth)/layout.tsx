import Link from "next/link";
import { Logo } from "@naamdev/ui";
import { ProductImage } from "@/components/common/product-image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="nd-gradient-royal relative hidden overflow-hidden lg:block">
        <div className="nd-pattern absolute inset-0 opacity-30" />
        <div className="relative flex h-full flex-col justify-between p-12 text-cream-100">
          <Link href="/"><Logo size="lg" tone="light" /></Link>
          <div className="relative mx-auto aspect-square w-[78%]">
            <ProductImage src="/static/catalog/kaju-katli.svg" alt="" className="absolute left-0 top-0 h-[62%] w-[62%] rounded-full shadow-2xl ring-8 ring-white/10" sizes={500} priority />
            <ProductImage src="/static/catalog/motichoor-laddu.svg" alt="" className="absolute bottom-0 right-0 h-[56%] w-[56%] animate-float rounded-full shadow-2xl ring-8 ring-white/10" sizes={500} />
          </div>
          <div>
            <p className="font-display text-4xl font-semibold leading-tight">Mithaas that<br />feels like home.</p>
            <p className="mt-3 max-w-sm text-sm text-cream-200/75">Fresh sweets every morning, rewards on every order, and live tracking right to your doorstep.</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" className="lg:hidden"><Logo size="md" /></Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </div>
    </div>
  );
}
