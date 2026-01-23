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

export default class SoapClient {
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
        return this.request('createMember.asmx', {library, sourcefile, member, sourcetype: ext, title});
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
