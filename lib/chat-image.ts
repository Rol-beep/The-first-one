export const photoTypes = ["image/jpeg", "image/png", "image/webp"];
export const photoLimit = 4_000_000;
export const imagePromptLimit = 500;

export function validPhoto(file: File) {
  return photoTypes.includes(file.type) && file.size > 0 && file.size <= photoLimit;
}

export async function hasPhotoSignature(file: File) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  switch (file.type) {
    case "image/jpeg":
      return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    case "image/png":
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
        .every((byte, index) => header[index] === byte);
    case "image/webp":
      return String.fromCharCode(...header.subarray(0, 4)) === "RIFF" &&
        String.fromCharCode(...header.subarray(8, 12)) === "WEBP";
    default:
      return false;
  }
}
