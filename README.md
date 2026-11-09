# Money with Wei — Storefront

> This repo also contains a separate, private app: **[`youtube-dashboard/`](youtube-dashboard/README.md)**,
> a multi-channel YouTube analytics dashboard with an automatic Sunday 08:00 KST weekly report.
> It deploys as its own Vercel project (Root Directory `youtube-dashboard`) and doesn't affect the storefront.

A one-page website for [www.moneywithwei.com](https://www.moneywithwei.com) showcasing the
digital products (PDF guides + spreadsheets) sold on
[Gumroad](https://sophatphalla.gumroad.com).

Buyers click **Buy now** and check out through Gumroad's overlay popup without leaving
the site — no backend, no payment handling, nothing to maintain.

## Tech stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v4**
- Gumroad overlay checkout (`https://gumroad.com/js/gumroad.js`)
- Fully static — every route prerenders, so it deploys anywhere

## Getting started

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build
npm start         # serve the production build
npm run lint      # ESLint
```

## Editing your store

Everything you'd normally want to change lives in **one file: `data/site.ts`**.

- **Store info** — name, domain, tagline, description, Gumroad profile link.
- **Products** — an array of product objects. To add a product, copy an existing entry
  and change the `id`, `title`, `blurb`, `description`, `price`, `url` (your Gumroad
  product link), `image` (cover image URL), and `features` (the "What's inside" bullets).

The page renders whatever is in that array — one product shows as a large feature card;
more products stack below it.

## Deploying to your domain

**Vercel (easiest):**

1. Push this repo to GitHub (already done if you're reading this there).
2. Go to [vercel.com](https://vercel.com), import the repo, accept the defaults, deploy.
3. In the Vercel project → **Settings → Domains**, add `www.moneywithwei.com`.
4. At your domain registrar, add the DNS records Vercel shows you
   (a CNAME for `www` pointing to `cname.vercel-dns.com`, and the apex redirect).

No environment variables are needed. **Netlify** or any Node host works the same way
(`npm run build && npm start`).

## Structure

```
app/
  layout.tsx     Site metadata (SEO/Open Graph) + Gumroad overlay script
  page.tsx       The one-page storefront (header, hero, products, footer)
  globals.css    Tailwind v4 theme (brand colors)
  robots.ts      robots.txt
  sitemap.ts     sitemap.xml
data/
  site.ts        ← Your store info and products (edit this)
```
