// Simplified version of the upload logic

// Utility function for fetch with timeout using AbortController
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return response;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeoutMs}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

interface UploadParams {
    server: string;
    sessionId: string;
    library: string;
    sourcefile: string;
    member: string;
    ext: string;
    title: string;
    lines: string[];
    timeout?: number;
    autoCompile?: boolean;
    fileContent?: string;
    severity?: number;
}

interface CompileError {
    code: string;
    severity: string;
    line: number;
    message: string;
    startPos: number;
    endPos: number;
}

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

class SoapClient {
    private baseUrl: string;
    private headers: Record<string, string>;
    private timeoutMs: number;

    constructor(server: string, sessionId: string, timeout = 30) {
        this.baseUrl = `http://${server}.regatta.com:7024/.${sessionId}/api`;
        this.headers = {
            'Content-Type': 'text/xml;charset=iso-8859-1',
            'SOAPAction': `http://${server}.regatta.com:7024/getData`
        };
        this.timeoutMs = timeout * 1000;
    }

    private buildXml(action: string, data: Record<string, any>): string {
        const dataXml = Object.entries(data)
            .map(([key, value]) => {
                if (Array.isArray(value)) {
                    return value.map(v => `<${key}>${v}</${key}>`).join('');
                }
                return `<${key}>${value}</${key}>`;
            })
            .join('');

        return `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns="http://${this.baseUrl.split('/')[2]}/"><SOAP-ENV:Body><getData>${dataXml}</getData></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
    }

    private async request(endpoint: string, data: Record<string, any>) {
        const xml = this.buildXml('getData', data);
        const response = await fetchWithTimeout(`${this.baseUrl}/${endpoint}`, {
            method: 'POST',
            headers: this.headers,
            body: xml
        }, this.timeoutMs);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
    }

    async createMember(library: string, sourcefile: string, member: string, ext: string, title: string) {
        return this.request('createMember.asmx', {
            library, sourcefile, member, sourcetype: ext, title
        });
    }

    async uploadSource(library: string, sourcefile: string, member: string, lines: string[]) {
        const sequences = lines.map((_, i) => i + 1);
        const encodedLines = lines.map(line => {
            const paddedLine = line.padEnd(100, ' ');
            return Buffer.from(paddedLine, 'latin1').toString('base64');
        });
        const dates = lines.map(() => '000000');

        return this.request('putSource.asmx', {
            library,
            sourcefile,
            member,
            sequence: sequences,
            data: encodedLines,
            date: dates
        });
    }

    async compileProgram(library: string, sourcefile: string, member: string, ext: string, isModule: boolean) {
        return this.request('compileProgram.asmx', {
            sourcelib: library,
            sourcefile,
            sourcetype: ext,
            module: isModule ? 1 : 0,
            member,
            objectlib: library
        });
    }

    async getSpoolFile(spoolid: string, jobid: string): Promise<string> {
        const params = `spoolid=${encodeURIComponent(spoolid)}&jobid=${encodeURIComponent(jobid)}`;
        const url = `http://${this.baseUrl.split('/')[2]}/programs/getSpoolFile.aspx?${params}`;

        const response = await fetchWithTimeout(url, {}, this.timeoutMs);
        return response.text();
    }
}

class ErrorParser {
    static decodeEbcdic(data: string): string[] {
        let decoded = data.trim() + "15"; // Force line break
        let errors: string[] = [];
        let line = "";

        for (let i = 0; i < decoded.length; i += 2) {
            const hex = decoded.slice(i, i + 2).toUpperCase();

            if (["00", "0D"].includes(hex)) {
                continue;
            } else if (["0C", "15"].includes(hex)) {
                if (line.trim()) errors.push(line);
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

export async function uploadAndCompile(params: UploadParams, progress: any, outputChannel: any, document?: any) {
    const soap = new SoapClient(params.server, params.sessionId, params.timeout);

    try {
        // Create member
        progress.report({ message: 'Creating member...' });
        await soap.createMember(params.library, params.sourcefile, params.member, params.ext, params.title);

        // Upload source
        progress.report({ message: `Uploading ${params.lines.length} lines...` });
        await soap.uploadSource(params.library, params.sourcefile, params.member, params.lines);

        progress.report({ message: 'Upload complete!' });
        vscode.window.showInformationMessage(`Source uploaded successfully: ${params.member}`);

        if (params.autoCompile) {
            await compileSource(soap, params, progress, outputChannel, document);
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Upload failed: ${message}`);
        throw error;
    }
}

async function compileSource(soap: SoapClient, params: UploadParams, progress: any, outputChannel: any, document?: any) {
    // Skip compilation for header/service files
    if (['qrpglehdr', 'qsrvsrc'].includes(params.sourcefile.toLowerCase())) {
        return;
    }

    progress.report({ message: 'Compiling...' });

    const isModule = /nomain/i.test(params.fileContent?.substring(0, 500) || '');

    try {
        const response = await soap.compileProgram(
            params.library, params.sourcefile, params.member, params.ext, isModule
        );

        const body = await response.text();
        await handleCompileResponse(body, soap, params, outputChannel, document);

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        outputChannel.appendLine(`Compile failed: ${message}`);
        outputChannel.show(true);
        vscode.window.showErrorMessage(`Compile failed: ${message}`);
    }
}

async function handleCompileResponse(body: string, soap: SoapClient, params: UploadParams, outputChannel: any, document?: any) {
    if (/faultstring/i.test(body)) {
        const match = body.match(/<faultstring>([\s\S]*?)<\/faultstring>/i);
        const error = match ? match[1] : 'Unknown compile error';
        outputChannel.appendLine(`Compile failed: ${error}`);
        outputChannel.show(true);
        vscode.window.showErrorMessage(`Compile failed: ${error}`);
        return;
    }

    if (/<result>1<\/result>/i.test(body)) {
        vscode.window.showInformationMessage('Source compiled successfully.');
        return;
    }

    if (/<result>0<\/result>/i.test(body)) {
        await handleCompileErrors(body, soap, params, outputChannel, document);
        return;
    }

    // Unknown result
    outputChannel.appendLine('Compile completed with unknown result:');
    outputChannel.appendLine(body);
    outputChannel.show(true);
    vscode.window.showWarningMessage('Compile completed with unknown result.');
}

async function handleCompileErrors(body: string, soap: SoapClient, params: UploadParams, outputChannel: any, document?: any) {
    const spoolMatch = body.match(/<spoolid>([\s\S]*?)<\/spoolid>/i);
    const jobMatch = body.match(/<jobid>([\s\S]*?)<\/jobid>/i);

    if (!spoolMatch?.[1] || !jobMatch?.[1]) {
        vscode.window.showErrorMessage('Compile failed, but no spool file info found.');
        return;
    }

    try {
        const spoolData = await soap.getSpoolFile(spoolMatch[1], jobMatch[1]);
        const errorLines = ErrorParser.decodeEbcdic(spoolData);
        const errors = ErrorParser.parseErrors(errorLines);

        outputChannel.appendLine('Compile errors:');
        errorLines.forEach(line => outputChannel.appendLine(line));
        outputChannel.show(true);

        const filteredErrors = errors.filter(e => parseInt(e.severity) >= (params.severity || 0));

        if (filteredErrors.length > 0 && document) {
            await showErrorQuickPick(filteredErrors, document);
        }

        vscode.window.showErrorMessage(`Compile failed with ${filteredErrors.length} error(s).`);

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Compile failed and could not retrieve spool file: ${message}`);
    }
}

async function showErrorQuickPick(errors: CompileError[], document: any) {
    const items = errors.map(e => ({
        label: `[${e.severity}] ${e.code}`,
        description: e.message,
        error: e
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select an error to navigate to'
    });

    if (selected) {
        const editor = await vscode.window.showTextDocument(document);
        const line = selected.error.line - 1;
        const start = new vscode.Position(line, Math.max(0, selected.error.startPos));
        const end = new vscode.Position(line, Math.max(0, selected.error.endPos));

        editor.selection = new vscode.Selection(start, end);
        editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
    }
}
