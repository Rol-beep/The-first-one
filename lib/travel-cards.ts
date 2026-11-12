export const travelSources = {
  Pogoda: "Open-Meteo",
  Waluty: "NBP",
  Święta: "Nager.Date",
  Wikipedia: "Wikipedia (PL)",
  Czas: "Zegar systemowy · strefy IANA",
} as const;

export type TravelCardTitle = keyof typeof travelSources;
export const travelCardTitles = Object.keys(travelSources) as TravelCardTitle[];

export type TravelCard = {
  title: TravelCardTitle;
  source: string;
  retrievedAt: string;
} & (
  | { unavailable: true }
  | { unavailable?: false; value: string; details?: string[]; link?: string }
);

export type TravelEvent =
  | { type: "destination"; destination: string }
  | { type: "card"; card: TravelCard }
  | { type: "summary"; advice: string | null };
