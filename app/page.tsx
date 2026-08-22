import Image from "next/image";
import { site, products } from "@/data/site";

export default function Home() {
  const featured = products[0];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <a href="#top" className="text-lg font-bold tracking-tight text-ink-950">
            {site.name}
          </a>
          <nav className="flex items-center gap-4">
            <a
              href="#products"
              className="hidden text-sm font-medium text-slate-600 hover:text-ink-950 sm:block"
            >
              Products
            </a>
            <a
              href={featured.url}
              className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              Get the Blueprint
            </a>
          </nav>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero */}
        <section className="bg-ink-950 text-white">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
            <p className="mb-4 inline-block rounded-full border border-gold-400/40 bg-gold-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-300">
              {site.tagline}
            </p>
            <h1 className="max-w-2xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Turn your retirement number into a{" "}
              <span className="text-brand-400">month-by-month plan</span>.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
              {site.description}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#products"
                className="rounded-full bg-brand-500 px-6 py-3 text-base font-semibold text-ink-950 shadow-lg transition hover:bg-brand-400"
              >
                See the products
              </a>
              <span className="text-sm text-slate-400">
                Instant download · Secure checkout via Gumroad
              </span>
            </div>
          </div>
        </section>

        {/* Products */}
        <section id="products" className="scroll-mt-16 bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight text-ink-950">
              Products
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
              Digital downloads, delivered instantly after checkout.
            </p>

            <div className="mt-12 space-y-12">
              {products.map((product) => (
                <article
                  key={product.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid md:grid-cols-2"
                >
                  <div className="relative aspect-[4/3] md:aspect-auto md:min-h-[24rem]">
                    <Image
                      src={product.image}
                      alt={`${product.title} cover`}
                      fill
                      sizes="(min-width: 768px) 50vw, 100vw"
                      className="object-cover"
                      priority
                      // Served straight from Gumroad's CDN in the browser —
                      // avoids proxying every cover through the image optimizer.
                      unoptimized
                    />
                  </div>
                  <div className="flex flex-col p-6 sm:p-8">
                    <h3 className="text-2xl font-bold tracking-tight text-ink-950">
                      {product.title}
                    </h3>
                    <p className="mt-2 font-medium text-brand-700">{product.blurb}</p>
                    <p className="mt-4 text-sm leading-relaxed text-slate-600">
                      {product.description}
                    </p>

                    <h4 className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      What&apos;s inside
                    </h4>
                    <ul className="mt-3 space-y-2">
                      {product.features.map((feature) => (
                        <li key={feature} className="flex gap-2 text-sm text-slate-700">
                          <span aria-hidden className="mt-0.5 shrink-0 font-bold text-brand-600">
                            ✓
                          </span>
                          {feature}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-8 flex items-center justify-between gap-4 border-t border-slate-100 pt-6">
                      <div>
                        <span className="text-3xl font-extrabold text-ink-950">
                          {product.price}
                        </span>
                        <span className="ml-1 text-sm text-slate-500">USD</span>
                      </div>
                      <a
                        href={product.url}
                        className="rounded-full bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-brand-700"
                      >
                        Buy now
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section className="border-t border-slate-200 bg-white py-12">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 text-center sm:grid-cols-3 sm:px-6">
            <div>
              <p className="text-2xl" aria-hidden>
                ⚡
              </p>
              <h3 className="mt-2 font-semibold text-ink-950">Instant delivery</h3>
              <p className="mt-1 text-sm text-slate-600">
                Download your files immediately after purchase.
              </p>
            </div>
            <div>
              <p className="text-2xl" aria-hidden>
                🔒
              </p>
              <h3 className="mt-2 font-semibold text-ink-950">Secure checkout</h3>
              <p className="mt-1 text-sm text-slate-600">
                Payments are handled end-to-end by Gumroad.
              </p>
            </div>
            <div>
              <p className="text-2xl" aria-hidden>
                🇸🇬
              </p>
              <h3 className="mt-2 font-semibold text-ink-950">Built for Singapore</h3>
              <p className="mt-1 text-sm text-slate-600">
                CPF LIFE, SRS, and local tax rules — not generic US advice.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-8 text-center text-sm text-slate-500 sm:px-6">
          <p>
            © {new Date().getFullYear()} {site.name}. All rights reserved.
          </p>
          <p className="mt-2">
            <a
              href={site.gumroadProfile}
              className="font-medium text-brand-700 hover:underline"
            >
              View store on Gumroad
            </a>
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-xs leading-relaxed text-slate-400">
            Educational content only — nothing on this site is personalised
            financial advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
