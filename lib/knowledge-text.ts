export const knowledgeContentLimit = 20_000;
export const knowledgeTitleLimit = 200;

export function validateKnowledgeDocument(title: string, content: string) {
  return {
    title: !title.trim() ? 'Wpisz tytuł dokumentu.' : title.trim().length > knowledgeTitleLimit ? 'Tytuł może mieć maksymalnie 200 znaków.' : '',
    content: !content.trim() ? 'Wklej treść dokumentu.' : content.length > knowledgeContentLimit ? 'Treść może mieć maksymalnie 20 000 znaków.' : '',
  };
}

// Blank lines delimit paragraphs. Keep each paragraph intact, including long ones.
export function splitKnowledgeDocument(content: string): string[] {
  return content.replace(/\r\n?/g, '\n').split(/\n[\t ]*\n(?:[\t ]*\n)*/u)
    .map(paragraph => paragraph.trim()).filter(Boolean);
}
