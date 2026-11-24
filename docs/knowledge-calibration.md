# Kalibracja wyszukiwania — 19 listopada 2026

Model: `openai/text-embedding-3-small`, 1536 wymiarów. Dokumenty: `Cennik 2026.` i `FAQ`.
Jedno embedMany dla ośmiu pytań, następnie match_chunks po trzy wyniki.
Próg zapisany wyłącznie w `lib/knowledge-sources.ts`: 0,45.

| Pytanie | Najwyższe podobieństwo |
| --- | --- |
| Ile kosztuje pakiet Start? | 0.632 |
| Jak długo trwa wdrożenie agenta? | 0.752 |
| Czy jest okres próbny? | 0.728 |
| Gdzie przechowywane są dane rozmów? | 0.809 |
| Ile kosztuje Start i czy dostanę rabat studencki 30%? | 0.533 |
| Jaka jutro będzie pogoda w Lizbonie? | 0.214 |
| Jak upiec ciasto drożdżowe? | 0.279 |
| Ile księżyców ma Jowisz? | 0.280 |

Dla pytania o cenę Start i rabat studencki fragment zawierający cenę uzyskał 0,479.
Próg 0,45 zachowuje tę częściową odpowiedź i odrzuca wszystkie wyniki trzech pytań niezwiązanych z bazą (maksimum 0,281).
Nie dowodzi to, że każdy dopuszczony fragment odpowiada na pytanie. Model ma sprawdzać treść, osobno wskazywać brakujące informacje i cytować wyłącznie wykorzystane sourceId.
Wynik procentowy oznacza podobieństwo kosinusowe, nie prawdopodobieństwo poprawnej odpowiedzi.
Po zmianie modelu lub istotnej zmianie dokumentów kalibrację należy powtórzyć.
