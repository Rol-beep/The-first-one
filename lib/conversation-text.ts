import { createHash } from "node:crypto";
import { getToolName, isToolUIPart, type UIMessage } from "ai";

export function storedMessageId(conversationId: string, role: string, messageId: string) {
  const hex = createHash("sha256").update(JSON.stringify([conversationId, role, messageId])).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function conversationText(message: UIMessage) {
  return message.parts.flatMap(part => {
    if (part.type === "text") {
      return [part.text.replace(/!\[[^\]]*\]\([^)]*\)/g, "[obraz]")
        .replace(/data:image\/[^\s"'<>)]*/gi, "[obraz]")];
    }
    if (part.type === "file") return ["[obraz]"];
    if (isToolUIPart(part) && getToolName(part) === "generujObraz" &&
        part.state === "output-available" && part.output && typeof part.output === "object" &&
        "image" in part.output && part.output.image) return ["[obraz]"];
    return [];
  }).join("\n").trim();
}
