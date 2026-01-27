export type Eol = "\r\n" | "\n";

export function detectEol(text: string): Eol {
    return text.includes("\r\n") ? "\r\n" : "\n";
}
