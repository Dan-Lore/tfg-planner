/** Strip Minecraft § formatting codes from translated strings. */
export function stripFormatting(text: string): string {
  return text.replace(/§./g, '');
}
