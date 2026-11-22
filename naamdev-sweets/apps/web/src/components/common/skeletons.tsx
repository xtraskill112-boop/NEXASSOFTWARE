import { Skeleton } from "@naamdev/ui";

/** Placeholder for one menu line (text on the left, photo + ADD on the right). */
export function MenuItemSkeleton() {
  return (
    <div className="flex gap-4 border-b border-dashed border-line py-5" aria-hidden="true">
      <div className="flex-1 space-y-2.5 pt-1">
        <Skeleton className="h-3.5 w-16" rounded="rounded" />
        <Skeleton className="h-4 w-3/5" rounded="rounded" />
        <Skeleton className="h-4 w-20" rounded="rounded" />
        <Skeleton className="h-3.5 w-11/12" rounded="rounded" />
        <Skeleton className="h-3.5 w-2/3" rounded="rounded" />
      </div>
      <Skeleton className="h-[128px] w-[136px] shrink-0" rounded="rounded-2xl" />
    </div>
  );
}

export function MenuListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading items" className="grid lg:grid-cols-2 lg:gap-x-10">
      {Array.from({ length: rows }, (_, i) => <MenuItemSkeleton key={i} />)}
    </div>
  );
}

/** The home page while the menu loads: shop card, offer cards, category circles, menu lines. */
export function HomeSkeleton() {
  return (
    <div role="status" aria-label="Loading the menu" className="mx-auto max-w-3xl px-4 pt-4">
      <div className="space-y-3 rounded-3xl border border-line p-4">
        <Skeleton className="h-6 w-52" rounded="rounded" />
        <Skeleton className="h-4 w-40" rounded="rounded" />
        <div className="space-y-2.5 border-t border-dashed border-line pt-3">
          <Skeleton className="h-4 w-48" rounded="rounded" />
          <Skeleton className="h-4 w-64" rounded="rounded" />
          <Skeleton className="h-4 w-56" rounded="rounded" />
        </div>
      </div>
      <div className="mt-5 flex gap-3 overflow-hidden">
        {[0, 1].map((i) => <Skeleton key={i} className="h-16 w-[268px] shrink-0" rounded="rounded-2xl" />)}
      </div>
      <div className="mt-6 flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[72px] w-[72px] shrink-0" rounded="rounded-full" />)}
      </div>
      <div className="mt-4">{Array.from({ length: 4 }, (_, i) => <MenuItemSkeleton key={i} />)}</div>
    </div>
  );
}

/** Product page while it loads: photo on one side, name, price and weight rows on the other. */
export function ProductPageSkeleton() {
  return (
    <div role="status" aria-label="Loading product" className="mx-auto grid max-w-7xl gap-8 px-4 pb-28 pt-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
      <Skeleton className="aspect-square w-full" rounded="rounded-xl" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" rounded="rounded" />
        <Skeleton className="h-8 w-3/4" rounded="rounded" />
        <Skeleton className="h-4 w-full" rounded="rounded" />
        <div className="space-y-3 rounded-xl border border-line p-5">
          <Skeleton className="h-8 w-24" rounded="rounded" />
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" rounded="rounded-lg" />)}
          <Skeleton className="h-12 w-full" rounded="rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Category tiles while they load. */
export function CategoryGridSkeleton() {
  return (
    <div role="status" aria-label="Loading categories" className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6">
      <Skeleton className="h-8 w-44" rounded="rounded" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[4/3] w-full" rounded="rounded-xl" />)}
      </div>
    </div>
  );
}
