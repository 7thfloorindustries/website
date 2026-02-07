export interface CaseStudyStat {
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
  numericValue?: number;
  decimals?: number;
}

export interface CaseStudy {
  id: string;
  title: string;
  category: string;
  description: string;
  stats: CaseStudyStat[];
}

export const verzuzCaseStudy: CaseStudy = {
  id: "1",
  title: "Mike Will Made-It × Hit-Boy Verzuz",
  category: "Seeding Campaign",
  description:
    "We orchestrated a strategic seeding campaign across key cultural moments that drove organic conversation and positioned the event as must-see viewing. Through targeted creator partnerships and community engagement, we turned a battle into a cultural phenomenon.",
  stats: [
    { label: "Spend", value: "$5K", prefix: "$", suffix: "K", numericValue: 5 },
    { label: "Views", value: "3.5M", suffix: "M", numericValue: 3.5, decimals: 1 },
    { label: "Trending", value: "#1" },
  ],
};
