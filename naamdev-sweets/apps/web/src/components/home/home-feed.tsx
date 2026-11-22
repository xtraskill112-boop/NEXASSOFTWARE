"use client";
import type { HomeFeed } from "@naamdev/api-client";
import { localized } from "@naamdev/shared/i18n";
import { ErrorState } from "@naamdev/ui";
import { HomeSkeleton } from "@/components/common/skeletons";
import { CategoryGrid } from "@/components/home/category-grid";
import { FullMenu } from "@/components/home/full-menu";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { BannerRow, DealsRow, ShopInfo } from "@/components/home/shop-info";
import { CollectionShowcase, CouponsRail, OfferStrip, PersonalRail, PromoGrid, RecentlyViewed, TrustStrip } from "@/components/home/sections";
import { ProductRail } from "@/components/product/product-rail";
import { useI18n } from "@/lib/i18n";
import { usePublic } from "@/lib/use-public";

const LINKS: Record<string, string> = {
  BESTSELLERS: "/search?flag=bestseller",
  NEW_ARRIVALS: "/search?flag=new",
  POPULAR: "/search?sort=popular",
  TRENDING: "/search?sort=popular",
  FAVOURITES: "/search?sort=rating",
  GIFT_HAMPERS: "/category/gift-hampers",
  RECOMMENDED: "/search?flag=featured",
};

export function HomeFeedView() {
  const { locale } = useI18n();
  const { data: feed, loading } = usePublic<HomeFeed>("/catalog/home");
  if (loading && !feed) return <HomeSkeleton />;
  if (!feed)
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <ErrorState title="Our kitchen is warming up" description="We couldn't load the menu right now. Please refresh in a moment." />
      </div>
    );
  const title = (s: HomeFeed["sections"][number]) => localized(s, "title", locale);
  let promoShown = false;
  const hasMenu = feed.sections.some((s) => s.type === "FULL_MENU");

  return (
    <div className="pb-4">
      {hasMenu ? (
        <>
          {/* Shop header, offers and banners, then the whole menu — like a food-delivery shop page. */}
          <ShopInfo freeDeliveryPaise={feed.freeDeliveryThresholdPaise} />
          <DealsRow coupons={feed.sections.find((s) => s.type === "OFFERS")?.coupons ?? []} strip={feed.banners.strip} />
          <BannerRow banners={feed.banners.hero} />
        </>
      ) : (
        <>
          <HeroCarousel banners={feed.banners.hero} />
          <TrustStrip />
          <OfferStrip banners={feed.banners.strip} />
        </>
      )}
      {feed.sections.map((s, idx) => {
        if (hasMenu && s.type === "OFFERS") return null;
        const node = (() => {
          switch (s.type) {
            case "FULL_MENU":
              return <FullMenu section={s} />;
            case "CATEGORY_GRID":
              return <CategoryGrid title={title(s)} categories={s.categories ?? []} />;
            case "OFFERS":
              return <CouponsRail title={title(s)} coupons={s.coupons ?? []} />;
            case "RECENTLY_VIEWED":
              return <RecentlyViewed title={title(s)} initial={s.products} />;
            case "FREQUENTLY_PURCHASED":
              return <PersonalRail type="FREQUENTLY_PURCHASED" title={title(s)} />;
            case "FESTIVAL_COLLECTION":
              return s.collection ? <CollectionShowcase section={s} /> : null;
            default:
              return <ProductRail title={title(s)} subtitle={s.subtitle} products={s.products ?? []} href={LINKS[s.type]} />;
          }
        })();
        // Interleave the promo grid after the third section for visual rhythm.
        const promo = !promoShown && idx >= 4 && s.products?.length ? ((promoShown = true), <PromoGrid key="promo" banners={feed.banners.promo} />) : null;
        return (
          <div key={s.id}>
            {node}
            {promo}
          </div>
        );
      })}
    </div>
  );
}
