import { tool } from 'ai';
import { z } from 'zod';
import { explicitProfileFacts } from './profile-policy';
import { saveUserProfile } from './supabase';

export function profileTool(userText: string) {
  const patch = explicitProfileFacts(userText);
  let saved = false;
  return tool({
    description: 'Zapamiętuje wyłącznie bezpieczne fakty o użytkowniku, które podał wprost w swojej ostatniej wiadomości: imię, miasto, ulubione jedzenie, hobby, kolor, język lub styl odpowiedzi. Serwer sam wybiera fakty z tej wiadomości; nie przekazuj żadnych wartości. Nie używaj przy pytaniach, planach, żartach, cytatach, domysłach, sekretach ani danych wrażliwych. Po udanym zapisie krótko potwierdź dokładnie zapamiętane fakty. Jeśli narzędzie odmówi, nie twierdź, że zapisałeś profil.',
    inputSchema: z.object({}).strict(),
    execute: async () => {
      if (!patch.name && !Object.keys(patch.preferences).length) return { zapisano: false, powod: 'Brak jednoznacznych, bezpiecznych faktów o użytkowniku. Nic nie zapisano.' };
      try {
        if (!saved) await saveUserProfile(patch, true);
        saved = true;
        return { zapisano: true, name: patch.name, preferences: patch.preferences,
          uwaga: 'Wynik wymienia tylko fakty zapisane w tym wywołaniu. Pominięte pola profilu pozostają bez zmian; nie oznacza to, że nie były wcześniej zapisane.' };
      } catch {
        return { zapisano: false, powod: 'Nie udało się zapisać profilu. Spróbuj ponownie.' };
      }
    },
  });
}
