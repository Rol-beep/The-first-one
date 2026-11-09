# Studio Nova: dwa tryby w istniejącym chatbocie

## Zmiana i dokumentacja API

Projekt nadal używa `ai@7.0.159`, `@openrouter/ai-sdk-provider@3.1.0`,
`@ai-sdk/react@4.0.163` oraz `zod@4.6.7`. Nie dodano zależności.

Przed zmianą sprawdzono oficjalną dokumentację dołączoną do zainstalowanego
AI SDK (`node_modules/ai/docs/03-ai-sdk-core/10-generating-structured-data.mdx`),
README i definicje opcji oficjalnego pakietu OpenRouter oraz dokumentację
Route Handlers Next.js. SDK 7 obsługuje `streamText({ output: Output.object({
schema }), instructions, ... })`. Nie używamy przestarzałego `streamObject`
ani samego polecenia „zwróć JSON”.

Źródła:
- https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- https://github.com/OpenRouterTeam/ai-sdk-provider
- https://openrouter.ai/docs/guides/features/structured-outputs

W tym środowisku witryna dokumentacji OpenRouter i publiczny katalog modeli
zwracały HTTP 403; dokumentację pakietu i adaptera sprawdzono lokalnie.
Nie twierdzimy, że aktualny model produkcyjny został zweryfikowany na żywo.
Nie odczytywano plików sekretów ani nie wykonywano rzeczywistych generacji.

## Tryby

- **Zwykły czat**: `/api/chat`, dotychczasowy streaming tekstu. Nie wymaga
  JSON Schema ani odczytu katalogu modeli.
- **Analiza Studio Nova**: `/api/analyze`, jedna wiadomość klienta do 16000
  znaków. Osobny formularz i wynik: kategoria, priorytet, szkic, status sprawdzenia.
  Nie dołącza historii zwykłego czatu. Każdy wynik jest szkicem, również gdy
  `needs_review=false`. Nie wysyła maili, nie pobiera płatności i nie rezerwuje.

Oba endpointy sprawdzają sesję i Origin przed parsowaniem wejścia, sprawdzaniem
modelu i generowaniem. Klucz API jest czytany wyłącznie na serwerze. Zasady
hasła i sesji pozostają bez zmian.

## Schemat i reguły

Wszystkie cztery pola są wymagane. Dodatkowe pola są odrzucane:

```json
{
  "type": "object",
  "properties": {
    "category": {"type": "string", "enum": ["sales", "support", "billing", "unknown"]},
    "priority": {"type": "string", "enum": ["normal", "high"]},
    "draft": {"type": "string"},
    "needs_review": {"type": "boolean"}
  },
  "required": ["category", "priority", "draft", "needs_review"],
  "additionalProperties": false
}
```

- `sales`: oferta i cena.
- `support`: problem techniczny.
- `billing`: płatność lub zwrot.
- `unknown`: brak rozpoznanej sprawy; wymaga doprecyzowania.
- `high`: wyłącznie blokada opłaconego spotkania zaczynającego się w ciągu godziny
  (najwyżej 60 minut). Brak choć jednej informacji nie daje podstaw do `high`.
  Pozostałe przypadki mają `normal`.
- `needs_review=true`: brak danych albo konieczność decyzji/działania pracownika.

Instrukcja serwerowa zawiera te reguły i przykłady. Walidacja Zod sprawdza
strukturę, a nie prawdziwość i sens odpowiedzi. Klasyfikację trzeba ocenić na
przykładach podczas ręcznego testu wybranego modelu. Ze schematu wynika, że pusty
string jest dozwolonym `draft`; dodatkowa kontrola backendu odrzuca jednak pusty
szkic jako `OUTPUT_POLICY_VIOLATION`, bez dopisywania odpowiedzi za model.
Brak pola `draft` to zawsze błąd formatu.

## Zgodność ustawionego modelu

`OPENROUTER_API_KEY` i `OPENROUTER_MODEL` pozostają konfiguracją serwera.
Nie ma automatycznej zmiany modelu, dopłat, alternatywnego modelu, automatycznych
ponowień ani fallbacku do zwykłego tekstu w analizie.

Przed analizą serwer odczytuje publiczne `https://openrouter.ai/api/v1/models`
bez klucza i sprawdza dokładny identyfikator skonfigurowanego modelu oraz
`supported_parameters`: `structured_outputs` i `response_format`.
Katalog nie jest gwarancją dostępności konkretnego dostawcy. Dlatego żądanie
analizy dodatkowo wymaga `provider.require_parameters=true` i ścisłego
`response_format: json_schema` przez adapter OpenRouter.

- Brak modelu/parametrów: `MODEL_UNSUPPORTED`. Użytkownik dostaje informację,
  aby samodzielnie wybrać w `OPENROUTER_MODEL` model z obsługą JSON Schema,
  sprawdzić cenę i ponownie wdrożyć aplikację. Zwykły czat pozostaje dostępny.
- Nie można odczytać katalogu lub brakuje metadanych:
  `MODEL_CAPABILITIES_UNAVAILABLE`. Nie zgadujemy wsparcia i nie generujemy.
- Dostawca odrzuca JSON Schema mimo metadanych: także `MODEL_UNSUPPORTED`.
- Inne błędy dostawcy, np. brak środków, to `MODEL_ERROR`.

Bez pliku/zmiennej `OPENROUTER_MODEL` i skonfigurowanego dostępu nie da się
potwierdzić rzeczywistej analizy w tym środowisku. Pierwsze wywołanie wykonuje
użytkownik w przeglądarce, z własną konfiguracją.

## Strumień i błędy

Analiza zachowuje UI message stream (SSE) kompatybilny z `useChat`. Częściowy
JSON jest buforowany: UI pokazuje oczekiwanie, a pola wyniku dopiero po pełnej
walidacji SDK i aplikacji. Surowe zdarzenia/refusal i rozumowanie modelu nie są
wysyłane do klienta. SSE wysyła keep-alive w czasie oczekiwania.

Po rozpoczęciu SSE błędy mają zdarzenie `error`, nie nowy status HTTP.
`errorText` zawiera JSON `{ "code": "...", "message": "..." }`, który klient
zamienia na czytelny polski komunikat. Przed SSE brak konfiguracji/niezgodność
modelu zwraca 503. Sesja: 401; obcy Origin: 403; błędne wejście: 400.

Obsługiwane kody:
- `MODEL_REFUSAL`: jawna odmowa, content-filter lub pole refusal OpenRouter.
- `OUTPUT_TRUNCATED`: `length`/`interrupted`, również gdy tekst jest poprawnym JSON-em.
- `INVALID_OUTPUT`: brak wymaganego pola (także draft), zły typ, enum,
  dodatkowe pole lub niepoprawny JSON.
- `MODEL_ERROR`: awaria dostawcy/transportu albo nieznane zakończenie.
- `REQUEST_ABORTED`: anulowanie.
- `OUTPUT_POLICY_VIOLATION`: wynik zgodny ze schematem, ale odrzucony przez
  kontrolę zasad szkicu i obowiązkowego sprawdzenia (opis próby w prompt-injection.md).
- `MODEL_UNSUPPORTED`, `MODEL_CAPABILITIES_UNAVAILABLE`: jak wyżej.

Nie produkujemy zastępczego sukcesu, nie dopisujemy brakujących pól i nie
pokazujemy starego wyniku jako nowej analizy po błędzie. Przycisk „Przerwij
analizę” anuluje żądanie. Zwykły tekst odmowy bez sygnału dostawcy nie jest
niezawodnie rozpoznawalny; gdy nie pasuje do schematu, jest błędem formatu.
Błędy dostawcy i surowe odpowiedzi nie są zapisywane w logach aplikacji.

## Testy lokalne, bez wywoływania modelu

```sh
npm run test:json
npm run lint
npx next typegen
npx tsc --noEmit
npm run build
```

Testy używają lokalnych danych, mocków SDK i prawdziwego adaptera OpenRouter
ze sztucznym fetch. Sprawdzają wszystkie wymagane pola, enumy i typy, dodatkowe
pole, odmowę, ucięcie, przerwanie, błędy dostawcy, zgodność modelu, obie trasy,
401/403 przed generowaniem, zwykły tekst bez wymuszania schematu oraz renderowanie
nazwanych pól i błędu brakującego draft. Nie są testem semantycznej jakości LLM.
Build wymaga dostępu do istniejących fontów Google w layout.

## Testy ręczne po wdrożeniu

1. Zaloguj się. W „Zwykłym czacie” wyślij dwie wiadomości: tekstowa odpowiedź
   i historia powinny działać jak dotąd.
2. Przełącz na „Analiza Studio Nova”. Sprawdź:

| Wiadomość | category | priority | needs_review |
| --- | --- | --- | --- |
| Ile kosztuje konsultacja online? | sales | normal | false |
| Proszę o ofertę dla 8 osób. | sales | normal | true |
| Nie mogę się zalogować. | support | normal | true |
| Opłaciłem spotkanie za 30 minut, ale link nie działa. | support | high | true |
| Opłaciłem spotkanie jutro, ale link nie działa. | support | normal | true |
| Link nie działa, spotkanie za 30 minut (bez informacji o opłaceniu). | support | normal | true |
| Proszę o zwrot płatności. | billing | normal | true |
| Mam pytanie. | unknown | normal | true |

3. Zweryfikuj, że szkic nie deklaruje wykonania zwrotu, rezerwacji ani wysłania
   wiadomości; także przy `needs_review=false` pozostaje szkicem.
4. Przerwij analizę i sprawdź, że nie pojawia się gotowy, częściowy wynik.
5. Wyloguj się: żądania obu endpointów bez sesji muszą zwracać 401.
6. Po zmianie konfiguracji modelu sprawdź czytelny błąd braku obsługi trybu.
   Nie wybieraj droższego modelu bez świadomego zatwierdzenia jego ceny.

Rzeczywistych analiz modelu nie wykonywano automatycznie. Wysłanie wiadomości
w przeglądarce korzysta z konta OpenRouter i może naliczyć opłatę.

Próbę prompt injection i ograniczenia zabezpieczeń opisano w [prompt-injection.md](prompt-injection.md).
