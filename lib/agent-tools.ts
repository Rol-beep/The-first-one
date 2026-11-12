import { createHash } from "node:crypto";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import { cookieName } from "./workshop";

const timestamp = () => new Date().toISOString();
const date = z.iso.date();
const countryCode = z.string().trim().regex(/^[a-z]{2}$/i);
const apiHeaders = { Accept: "application/json", "User-Agent": "StanNaturalnyAssistant/1.0 (Wikimedia article lookup)" };

function publicApi<Input, Result extends Record<string, unknown>, Context = undefined>(
  inputSchema: z.ZodType<Input>,
  description: string,
  unavailable: string,
  execute: (input: Input, signal: AbortSignal, context?: Context) => Promise<Result>,
) {
  async function fetchData(input: Input, abortSignal?: AbortSignal, context?: Context) {
    const timeout = AbortSignal.timeout(8000);
    const signal = abortSignal ? AbortSignal.any([timeout, abortSignal]) : timeout;
    try {
      return { ...await execute(input, signal, context), pobrano: timestamp() };
    } catch {
      return { blad: unavailable, pobrano: timestamp() };
    }
  }

  return {
    fetchData,
    agentTool: tool<Input, Record<string, unknown>, Record<string, unknown>>({
      inputSchema: zodSchema(inputSchema),
      description,
      execute: (input, { abortSignal }) => fetchData(input, abortSignal),
    }),
  };
}

async function get(url: string, signal: AbortSignal) {
  return fetch(url, { signal, headers: apiHeaders, cache: "no-store" });
}

async function read<T>(response: Response, schema: z.ZodType<T>) {
  if (!response.ok) throw new Error("API response failed");
  return schema.parse(await response.json());
}

function query(base: string, params: Record<string, string>) {
  return base + "?" + new URLSearchParams(params);
}

const placesSchema = z.object({ results: z.array(z.object({
  name: z.string(), country: z.string().optional(), admin1: z.string().optional(),
  latitude: z.number(), longitude: z.number(),
  country_code: countryCode.optional(), timezone: z.string().optional(),
})).optional() });
type City = NonNullable<z.infer<typeof placesSchema>["results"]>[number];
export async function findCity(city: string, signal: AbortSignal, country?: string) {
  const locations = await read(await get(query("https://geocoding-api.open-meteo.com/v1/search", {
    name: city, count: "1", language: "pl", ...(country ? { countryCode: country.toUpperCase() } : {}),
  }), signal), placesSchema);
  return locations.results?.[0];
}

const forecastSchema = z.object({ daily: z.object({
  time: z.array(date),
  temperature_2m_min: z.array(z.number().nullable()),
  temperature_2m_max: z.array(z.number().nullable()),
  precipitation_probability_max: z.array(z.number().nullable()),
  weather_code: z.array(z.number().nullable()),
}) });

const { agentTool: pogoda, fetchData: fetchWeather } = publicApi(
  z.object({ miasto: z.string().trim().min(2).max(100), data: date, kraj: countryCode.optional() }),
  "Pobiera prognozę pogody dla miasta i dnia (data RRRR-MM-DD). Podaj dwuliterowy kod kraju, gdy pomaga rozróżnić miejscowości. Przy «jutro» ustal najpierw bieżącą datę narzędziem czas.",
  "Nie udało się pobrać prognozy Open-Meteo dla tej daty. Prognoza obejmuje maksymalnie 16 dni.",
  async ({ miasto, data, kraj }, signal, city?: City) => {
    const place = city ?? await findCity(miasto, signal, kraj);
    if (!place) return { blad: "Nie znaleziono miasta. Sprawdź nazwę lub podaj kraj." };
    const response = await read(await get(query("https://api.open-meteo.com/v1/forecast", {
      latitude: String(place.latitude), longitude: String(place.longitude),
      start_date: data, end_date: data, timezone: "auto",
      daily: "temperature_2m_min,temperature_2m_max,precipitation_probability_max,weather_code",
    }), signal), forecastSchema);
    const daily = response.daily;
    if (daily.time[0] !== data || daily.weather_code[0] == null) return { blad: "Brak prognozy dla podanej daty." };
    return {
      miasto: place.name, region: place.admin1, kraj: place.country, data,
      minC: daily.temperature_2m_min[0], maxC: daily.temperature_2m_max[0],
      prawdopodobienstwoOpadowProcent: daily.precipitation_probability_max[0],
      kodPogodyWMO: daily.weather_code[0], zrodlo: "Open-Meteo",
    };
  },
);

const ratesSchema = z.object({ rates: z.array(z.object({
  mid: z.number().positive(), effectiveDate: date,
})).nonempty() });

const { agentTool: waluty, fetchData: fetchCurrency } = publicApi(
  z.object({
    waluta: z.string().trim().regex(/^[a-z]{3}$/i),
    kwota: z.number().nonnegative().max(1e12).optional(),
    kierunek: z.enum(["do_PLN", "z_PLN"]).optional(),
  }),
  "Sprawdza ostatni średni kurs NBP waluty wobec PLN. Podaj kod ISO (np. EUR). Opcjonalnie przelicza kwotę na złote (do_PLN, domyślnie) lub ze złotych (z_PLN).",
  "Nie udało się pobrać kursu z NBP. Spróbuj ponownie później.",
  async ({ waluta, kwota, kierunek = "do_PLN" }, signal) => {
    const code = waluta.toUpperCase();
    const rateUrl = (table: string) => `https://api.nbp.pl/api/exchangerates/rates/${table}/${code}/?format=json`;
    let rate = 1;
    let published: string | undefined;
    if (code !== "PLN") {
      let response = await get(rateUrl("a"), signal);
      if (response.status === 404) response = await get(rateUrl("b"), signal);
      if (response.status === 404) return { blad: "NBP nie publikuje kursu dla tej waluty. Sprawdź kod waluty." };
      const { rates: [latest] } = await read(response, ratesSchema);
      rate = latest.mid;
      published = latest.effectiveDate;
    }
    return {
      waluta: code, kursPLN: rate, dataKursu: published,
      ...(kwota === undefined ? {} : {
        kwota, kierunek, wynik: kierunek === "do_PLN" ? kwota * rate : kwota / rate,
        walutaWyniku: kierunek === "do_PLN" ? "PLN" : code,
      }),
    };
  },
);

const holidaysSchema = z.array(z.object({
  date, localName: z.string(), types: z.array(z.string()), global: z.boolean(),
  counties: z.array(z.string()).nullish(),
}));

const { agentTool: swieta, fetchData: fetchHolidays } = publicApi(
  z.object({ kraj: countryCode, rok: z.number().int().min(1).max(9999) }),
  "Zwraca święta publiczne i dni wolne według Nager.Date. Podaj dwuliterowy kod kraju (np. PL) i rok. Wskaż użytkownikowi, jeśli święto jest regionalne.",
  "Nie udało się pobrać świąt z Nager.Date dla podanego kraju i roku.",
  async ({ kraj, rok }, signal) => {
    const code = kraj.toUpperCase();
    const response = await get(`https://date.nager.at/api/v3/PublicHolidays/${rok}/${code}`, signal);
    if (response.status === 404 || response.status === 204) return { blad: "Brak danych o świętach dla podanego kraju i roku." };
    const holidays = await read(response, holidaysSchema);
    return { kraj: code, rok, swieta: holidays.filter(item => item.types.includes("Public")).map(item => ({
      data: item.date, nazwa: item.localName, ogolnokrajowe: item.global,
      ...(!item.global && item.counties ? { regiony: item.counties } : {}),
    })) };
  },
);

const wikiSchema = z.object({ query: z.object({ pages: z.array(z.object({
  title: z.string(), pageid: z.number().optional(), extract: z.string().optional(), missing: z.boolean().optional(),
})) }) });

const { agentTool: wikipedia, fetchData: fetchWikipedia } = publicApi(
  z.object({ haslo: z.string().trim().min(1).max(150).regex(/^[^|]+$/) }),
  "Pobiera krótkie wprowadzenie i link do hasła w polskiej Wikipedii. Podaj tytuł hasła i dołącz link w odpowiedzi.",
  "Nie udało się pobrać hasła z polskiej Wikipedii.",
  async ({ haslo }, signal) => {
    const { query: { pages: [page] } } = await read(await get(query("https://pl.wikipedia.org/w/api.php", {
      action: "query", titles: haslo, redirects: "1", prop: "extracts",
      exintro: "1", explaintext: "1", exchars: "900", format: "json", formatversion: "2",
    }), signal), wikiSchema);
    if (!page?.pageid || page.missing || !page.extract?.trim()) return { blad: "Nie znaleziono streszczenia dla tego hasła. Sprawdź tytuł." };
    return { tytul: page.title, streszczenie: page.extract, link: `https://pl.wikipedia.org/?curid=${page.pageid}` };
  },
);

export { fetchWeather, fetchCurrency, fetchHolidays, fetchWikipedia };

const operations = {
  dodaj: (a: number, b: number) => a + b,
  odejmij: (a: number, b: number) => a - b,
  pomnoz: (a: number, b: number) => a * b,
  podziel: (a: number, b: number) => a / b,
  potega: (a: number, b: number) => a ** b,
  reszta: (a: number, b: number) => a % b,
};

const kalkulator = tool({
  description: "Wykonuje jedno działanie arytmetyczne na dwóch liczbach a i b. Do złożonego rachunku użyj kolejnych działań.",
  inputSchema: z.object({ dzialanie: z.enum(["dodaj", "odejmij", "pomnoz", "podziel", "potega", "reszta"]), a: z.number(), b: z.number() }),
  execute: ({ dzialanie, a, b }) => {
    if (b === 0 && (dzialanie === "podziel" || dzialanie === "reszta")) {
      return { blad: "Nie można dzielić przez zero.", pobrano: timestamp() };
    }
    const wynik = operations[dzialanie](a, b);
    return { ...(Number.isFinite(wynik) ? { wynik } : { blad: "Wynik wykracza poza zakres liczb rzeczywistych kalkulatora." }), pobrano: timestamp() };
  },
});

export function localTime(strefa = "Europe/Warsaw", now = new Date()) {
  try {
    const format = new Intl.DateTimeFormat("pl-PL", {
      timeZone: strefa, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    return { strefa: format.resolvedOptions().timeZone, dataIGodzina: format.format(now), pobrano: now.toISOString() };
  } catch {
    return { blad: "Nieznana strefa czasowa. Użyj nazwy takiej jak Europe/Warsaw lub UTC.", pobrano: now.toISOString() };
  }
}

const czas = tool({
  description: "Podaje aktualną datę, dzień tygodnia i godzinę w podanej strefie IANA (np. Asia/Tokyo). Użyj także przy pytaniach o dziś, jutro i liczbę dni do daty. Domyślnie Europe/Warsaw.",
  inputSchema: z.object({ strefa: z.string().trim().min(1).max(100).optional() }),
  execute: ({ strefa }) => localTime(strefa),
});

const notesBySession = new Map<string, { tresc: string; zapisano: string }[]>();

export function agentTools(request: Request, model: string, stepLimit: number, otherToolNames: string[]) {
  const notatki = tool({
    description: "Zapisuje notatkę w bieżącej sesji albo pokazuje zapisane notatki. Zapisuj wyłącznie na wyraźną prośbę użytkownika. Dane są tymczasowe.",
    inputSchema: z.object({
      akcja: z.enum(["zapisz", "pokaz"]),
      tresc: z.string().trim().min(1).max(1000).optional(),
    }).refine(input => input.akcja !== "zapisz" || input.tresc, { message: "Podaj treść notatki." }),
    execute: ({ akcja, tresc }) => {
      const pobrano = timestamp();
      const token = request.headers.get("cookie")?.split(";").map(part => part.trim())
        .find(part => part.startsWith(cookieName + "="));
      if (!token) return { blad: "Notatki wymagają aktywnej sesji.", pobrano };
      const key = createHash("sha256").update(token).digest("hex");
      const notes = notesBySession.get(key) ?? [];
      if (akcja === "pokaz") return { notatki: notes.slice(), pobrano };
      if (!tresc) return { blad: "Podaj treść notatki.", pobrano };
      if (notes.length >= 20) return { blad: "W tej sesji zapisano już 20 notatek.", pobrano };
      if (!notesBySession.has(key) && notesBySession.size >= 1000) {
        return { blad: "Pamięć notatek jest pełna.", pobrano };
      }
      notes.push({ tresc, zapisano: pobrano });
      notesBySession.set(key, notes);
      return { zapisano: true, pobrano };
    },
  });

  const tools = { pogoda, waluty, swieta, wikipedia, kalkulator, czas, notatki };
  const diagnostyka = tool({
    description: "Podaje model, dostępne narzędzia, limit kroków i status wymaganej konfiguracji. Użyj przy pytaniach o konfigurację lub możliwości agenta.",
    inputSchema: z.object({}),
    execute: () => ({
      model, narzedzia: [...Object.keys(tools), "diagnostyka", ...otherToolNames], limitKrokow: stepLimit,
      konfiguracja: {
        OPENROUTER_API_KEY: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
        OPENROUTER_MODEL: Boolean(process.env.OPENROUTER_MODEL?.trim()),
        CHAT_PASSWORD: Boolean(process.env.CHAT_PASSWORD),
        SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
      },
      pobrano: timestamp(),
    }),
  });
  return { ...tools, diagnostyka };
}
