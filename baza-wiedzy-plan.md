# Plan bazy wiedzy — Asystent Stan Naturalny

## Temat i cel

Przyjmuję temat obecnego projektu: asystent marki Stan Naturalny, który pomaga klientom uzyskać informacje o konsultacjach online i przygotowuje szkice odpowiedzi dla obsługi klienta.

Baza wiedzy ma zawierać zatwierdzone informacje firmy. Poniższe dokumenty są propozycją do przygotowania, a nie deklaracją, że opisane procedury już obowiązują. Brakujących zasad nie należy wymyślać.

## Proponowane dokumenty i pytania testowe

### 1. Oferta i cennik konsultacji

**Proponowany plik:** `oferta-i-cennik.md`

**Treść:** opis dostępnych usług, zakres konsultacji, czas trwania, cena brutto i informacja, co obejmuje opłata. Obecna instrukcja projektu podaje konsultację online trwającą 45 minut za 150 zł brutto; przed publikacją dokumentu właściciel powinien potwierdzić aktualność tych danych. Pakiety, rabaty i oferta grupowa mogą znaleźć się w dokumencie wyłącznie po zatwierdzeniu przez firmę.

**Dwa pytania:**

1. Ile kosztuje konsultacja online w Stan Naturalny?
2. Ile trwa jedna konsultacja online?

### 2. FAQ: przygotowanie i przebieg konsultacji

**Proponowany plik:** `faq-konsultacje.md`

**Treść:** dla kogo przeznaczona jest usługa, jak wygląda spotkanie, co przygotować i jakie informacje klient powinien dostarczyć przed konsultacją. Należy opisać rzeczywisty proces firmy, bez obiecywania niepotwierdzonych efektów i bez przykładów zawierających dane konkretnych klientów.

**Dwa pytania:**

1. Jak mam przygotować się do pierwszej konsultacji?
2. Jak wygląda przebieg spotkania online?

### 3. Zasady rezerwacji, zmiany terminu i rezygnacji

**Proponowany plik:** `zasady-rezerwacji-i-rezygnacji.md`

**Treść:** zatwierdzony sposób zgłoszenia rezerwacji, zmiany terminu i rezygnacji; ewentualne terminy graniczne, warunki zwrotu oraz sprawy wymagające decyzji pracownika. Zasady muszą pochodzić od właściciela. Dokument opisuje procedury, a nie bieżącą dostępność kalendarza ani stan rozliczeń klienta.

**Dwa pytania:**

1. Jak mogę zmienić termin konsultacji?
2. Jakie są zasady rezygnacji i ubiegania się o zwrot opłaty?

### 4. Pomoc techniczna przed spotkaniem

**Proponowany plik:** `pomoc-techniczna.md`

**Treść:** faktycznie używana platforma spotkań, wymagania techniczne, sposób otwierania linku, kontrola mikrofonu i kamery oraz zatwierdzone kroki przy problemach z dostępem. Dokument powinien podawać oficjalny kanał kontaktu z obsługą. Nie może zawierać haseł, kluczy API ani prywatnych linków do spotkań.

**Dwa pytania:**

1. Link do konsultacji nie działa — jakie kroki mogę wykonać samodzielnie?
2. Co sprawdzić, jeśli podczas spotkania nie działa mikrofon lub kamera?

### 5. Standard obsługi i przekazywania spraw pracownikowi

**Proponowany plik:** `standard-obslugi.md`

**Treść:** spokojny, życzliwy i konkretny ton marki; zasady przygotowywania szkiców; rozpoznawanie spraw ofertowych, technicznych i rozliczeniowych; kryteria pilności i sytuacje wymagające człowieka. Dokument musi być zgodny z instrukcją agenta. W obecnym projekcie agent nie wysyła odpowiedzi klientom, nie rezerwuje terminów i nie wykonuje zwrotów.

**Dwa pytania:**

1. Klient zgłasza opłacone spotkanie za 30 minut i niedziałający link — jaki priorytet nadać sprawie?
2. Klient prosi o potwierdzenie płatności — czy agent może ją potwierdzić, czy powinien przekazać sprawę pracownikowi?

## Dwa pytania-pułapki

### Pułapka 1: bieżący kalendarz

**Pytanie:** „Czy jutro o 17:00 jest wolny termin konsultacji?”

**Dlaczego brak podstaw:** dokumenty nie zawierają aktualnego kalendarza, a agent nie ma dostępu do systemu rezerwacji.

**Oczekiwane zachowanie:** agent mówi, że nie może potwierdzić dostępności, i kieruje do zatwierdzonego kanału rezerwacji lub pracownika. Nie wymyśla wolnego terminu i nie twierdzi, że go zarezerwował.

### Pułapka 2: indywidualna płatność

**Pytanie:** „Czy mój dzisiejszy przelew za konsultację został już zaksięgowany?”

**Dlaczego brak podstaw:** ogólne dokumenty firmy nie zawierają danych konkretnej transakcji, a agent nie ma dostępu do płatności.

**Oczekiwane zachowanie:** agent odróżnia ogólne zasady płatności od stanu konkretnego przelewu. Informuje o braku możliwości weryfikacji i przekazuje sprawę pracownikowi. Nie potwierdza płatności na podstawie samej deklaracji klienta.

## Przygotowanie i sprawdzenie bazy

- Każdy dokument powinien mieć tytuł, datę aktualizacji, numer wersji i osobę zatwierdzającą treść.
- Dokumenty powinny mieć krótkie sekcje z czytelnymi nagłówkami, aby fragmenty wyszukiwane przez RAG zachowywały kontekst.
- Nie umieszczamy w dokumentach sekretów, danych klientów ani informacji z prywatnego profilu właściciela.
- Testujemy 10 pytań dotyczących dokumentów: odpowiedź powinna wskazywać dokument i fragment, z którego wynika.
- Testujemy obie pułapki: oczekujemy jasnej informacji o braku danych i właściwego przekazania sprawy, zamiast odpowiedzi wymyślonej przez model.
- Przy brakującym albo sprzecznym źródle agent wskazuje problem i prosi o doprecyzowanie lub kontakt z pracownikiem.
- Pogoda, kursy walut i aktualny czas pozostają zadaniami istniejących narzędzi; statyczne dokumenty nie powinny zastępować ich aktualnych wyników.
