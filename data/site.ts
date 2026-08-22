// ---------------------------------------------------------------------------
// EDIT THIS FILE to change your store info and products.
// Nothing else needs to change — the page renders whatever is here.
// ---------------------------------------------------------------------------

export const site = {
  name: "Money with Wei",
  url: "https://www.moneywithwei.com",
  tagline: "Practical money guides for Singapore",
  description:
    "Digital guides and calculators from Money with Wei. Turn your retirement number into a month-by-month plan — built for Singapore, CPF LIFE included.",
  gumroadProfile: "https://sophatphalla.gumroad.com",
};

export interface Product {
  /** Unique id, used as the React key */
  id: string;
  title: string;
  /** One-line pitch shown under the title */
  blurb: string;
  /** Longer paragraph shown on the card */
  description: string;
  /** Display price, e.g. "$27" */
  price: string;
  /** Full Gumroad product URL — the Buy button opens this in the Gumroad overlay */
  url: string;
  /** Cover image URL (Gumroad-hosted images work fine) */
  image: string;
  /** "What's inside" bullet points */
  features: string[];
}

export const products: Product[] = [
  {
    id: "zivagk",
    title: "The Singapore Retirement Blueprint",
    blurb:
      "Turn your retirement number into a month-by-month plan. Built for Singapore, CPF LIFE included.",
    description:
      "The complete workbook and drawdown calculator that turns your number into a month-by-month plan. It is the full system behind the Money with Wei channel — finished, ordered, and ready to use.",
    price: "$27",
    url: "https://sophatphalla.gumroad.com/l/zivagk",
    image: "https://public-files.gumroad.com/4lwy7brf7spw5edar61l5ll712v9",
    features: [
      "The Drawdown Planner (spreadsheet): see exactly how long $300k, $500k, or $1 million lasts at your spending, with CPF LIFE layered in",
      "The 55-to-65 Bridge Plan: the decade that breaks most retirement plans, mapped step by step",
      "The Decision Trees: CPF top-up vs SRS vs invest, in the right order for your tax bracket and age",
      "The Implementation Walkthrough: a simple 3-fund structure, the 30% dividend-tax trap, and the setup checklist",
      "The Late-Starter Chapter: honest catch-up math for age 50 and over",
      "A 90-Day Plan with fill-in worksheets",
    ],
  },
  // To add another product, copy the object above and change the fields.
];
