// EBCDIC charset mapping
const EBCDIC_CHARSET: Record<string, string> = {
    "40": " ", "43": "ä", "45": "á", "47": "å", "49": "ñ", "4B": ".", "4C": "<", "4D": "(", "4E": "+", "53": "ë",
    "59": "ß", "5B": "$", "5C": "*", "5D": ")", "5E": ";", "60": "-", "61": "/", "6B": ",", "6C": "%", "6D": "_",
    "6E": ">", "6F": "?", "70": "ø", "7A": ":", "7B": "#", "7C": "@", "7D": "'", "7E": "=", "80": "Ø", "81": "a",
    "82": "b", "83": "c", "84": "d", "85": "e", "86": "f", "87": "g", "88": "h", "89": "i", "8E": "þ", "90": "°",
    "91": "j", "92": "k", "93": "l", "94": "m", "95": "n", "96": "o", "97": "p", "98": "q", "99": "r", "A0": "µ",
    "A2": "s", "A3": "t", "A4": "u", "A5": "v", "A6": "w", "A7": "x", "A8": "y", "A9": "z", "B0": "^", "BB": "]",
    "BE": "´", "C0": "{", "C1": "A", "C2": "B", "C3": "C", "C4": "D", "C5": "E", "C6": "F", "C7": "G", "C8": "H",
    "C9": "I", "D0": "\\", "D1": "J", "D2": "K", "D3": "L", "D4": "M", "D5": "N", "D6": "O", "D7": "P", "D8": "Q",
    "D9": "R", "E0": "}", "E2": "S", "E3": "T", "E4": "U", "E5": "V", "E6": "W", "E7": "X", "E8": "Y", "E9": "Z",
    "F0": "0", "F1": "1", "F2": "2", "F3": "3", "F4": "4", "F5": "5", "F6": "6", "F7": "7", "F8": "8", "F9": "9",
    "FA": "³", "FB": "Û", "FD": "Ù", "FF": "□"
};

export interface CompileError {
    code: string;
    severity: string;
    line: number;
    message: string;
    startPos: number;
    endPos: number;
};

export default class ErrorParser {
    static decodeEbcdic(data: string): string[] {
        let decoded = data.trim() + "15"; // Force line break
        let errors: string[] = [];
        let line = "";

        for (let i = 0; i < decoded.length; i += 2) {
            const hex = decoded.slice(i, i + 2).toUpperCase();

            if (["00", "0D"].includes(hex)) {
                continue;
            } else if (["0C", "15"].includes(hex)) {
                if (line.trim()) {
                    errors.push(line);
                }
                line = "";
            } else if (hex === "34") {
                i += 2; // Skip next 2 chars
            } else {
                line += EBCDIC_CHARSET[hex] || `[${hex}]`;
            }
        }

        return errors;
    }

    static parseErrors(errors: string[]): CompileError[] {
        const parsed: CompileError[] = [];
        let lastLine = "";

        for (const error of errors) {
            if (error === 'Errors were found during the binding step. See the job log for more information.') {
                parsed.push({
                    code: "", severity: "99", line: 1, message: error, startPos: 0, endPos: 0
                });
                continue;
            }

            const match = error.match(/^\*([A-Z0-9]+)\s+([0-9]{2})\s+([a-z0-9]+)\s+([0-9]{6})\+?\s+(.*)$/);
            if (match && match[1] !== 'RNF7066') {
                const [, code, severity, char, lineStr, message] = match;
                let startPos = 0, endPos = 0;

                if (/^[a-z]$/.test(char)) {
                    const pos = lastLine.indexOf(char);
                    if (pos > -1) {
                        startPos = pos - 2;
                        endPos = pos + char.length - 2;
                    }
                }

                parsed.push({
                    code, severity, line: parseInt(lineStr), message, startPos, endPos
                });
            } else {
                lastLine = error;
            }
        }

        return parsed;
    }
}
