interface OrderedMap {
    [key: string]: number;
}

class PreProcessor {
    private static readonly NAME = 'a-zA-Z0-9_';

    private lines: string[];
    private format: string;
    private source: string[] = [];
    private freeFormat = false;
    private compileTimeArray = false;
    private parameters = false;
    private datastructure = false;

    constructor(lines: string[], format: string) {
        this.lines = lines;
        this.format = format.toLowerCase();
    };

    process(): string[] {
        // Handle non-RPG formats early
        if (!['dspf', 'rpgle', 'sqlrpgle'].includes(this.format)) {
            return this.lines.map(line => line.trimEnd().substring(0, 100));
        }

        if (this.format === 'dspf') {
            return this.processDisplayFile();
        }

        return this.processRpgFile();
    }

    private processDisplayFile(): string[] {
        return this.lines.map(line => {
            line = line.trimEnd();

            if (line.length > 0 && /^[Aa]$/.test(line[0])) {
                return ' '.repeat(5) + line;
            }

            if (line.startsWith('//')) {
                return ' '.repeat(6) + '*' + line.substring(2);
            }

            return line;
        });
    };

    private processRpgFile(): string[] {
        for (let line of this.lines) {
            line = line.trimEnd();

            if (!this.compileTimeArray && line.startsWith('**')) {
                this.compileTimeArray = true;
            }

            if (this.compileTimeArray) {
                this.source.push(line);
                continue;
            }

            // Remove hard-coded compiler directives
            if (['/free', '/end-free'].includes(line.trim())) {
                line = '';
            }

            line = this.handleNewRpgFeatures(line);

            // Determine if line is free or fixed format
            if (line.trim() && !line.match(/^\s*\//)) {
                const isFixed = line.match(/^([chop]|\s*\*[^i]|\s*\*i.*[^;]$|\s*\*$|^d.{17}s|^d.{17}ds|^d\s.*[^;]$|^d\*|^f.{11}f|^f.{10}o|^f.{10}i[ps]|^f\s{30}|^i[^\s]*$|^i\s.*[^;]$)/i);

                if (isFixed && this.freeFormat) {
                    this.switchMode();
                } else if (!isFixed && !this.freeFormat) {
                    this.switchMode();
                }
            }

            // Remove 'reference' keyword
            line = line.replace(/^(d.{26} ([ 0-9]{6}[apin]| {7}) [ 0-9] )reference/i, '$1');
            line = this.autoIndent(line);
            this.appendLine(line);
        }

        return this.source;
    };

    private switchMode(): void {
        if (this.source.length > 0) {
            const lastLine = this.source.pop()!;
            if (lastLine.trim()) {
                this.source.push(lastLine);
            }
        }

        const insertLine = this.freeFormat ? '/end-free' : '/free';
        this.freeFormat = !this.freeFormat;
        this.source.push(' '.repeat(6) + insertLine);
    };

    private autoIndent(line: string): string {
        const regexes: OrderedMap = this.freeFormat
            ? { '\\/\\/': 7, '\\/': 6, '[^ ]': 7 }
            : { '\\/\\/': 6, '[\\/\\*]': 6, '[cdfhiop]': 5 };

        for (const [regex, length] of Object.entries(regexes)) {
            const match = line.match(new RegExp(`^( {0,${length}})${regex}`, 'i'));
            if (match) {
                return ' '.repeat(length - match[1].length) + line;
            }
        }
        return line;
    };

    private appendLine(line: string): void {
        this.source.push(line.substring(0, 100));
    };

    private handleNewRpgFeatures(line: string): string {
        // dcl-c constant
        let match = line.match(new RegExp(`^\\s*dcl-c ([${PreProcessor.NAME}]+) (.*);$`));
        if (match) {
            return this.generateLine('d', match[1], `c                   const(${match[2]})`);
        }

        // ctl-opt
        match = line.match(/^ctl-opt (.*);$/);
        if (match) {
            return 'h ' + match[1];
        }

        return this.handleNewRpgTables(line);
    };

    private handleNewRpgTables(line: string): string {
        const match = line.match(new RegExp(`^\\s*dcl-f ([${PreProcessor.NAME}]+)(.*)?;$`));
        if (!match) return this.handleNewRpgBlocks(line);

        let result = `f${match[1].padEnd(10)}`;
        let extra = match[2] || '';

        const usageMatch = extra.match(/usage\(([^\)]*)\)/);
        const usage = usageMatch ? usageMatch[1] : '';
        if (usageMatch) extra = extra.replace(/usage\([^\)]*\)/, '');

        // Determine file type
        if (usage.includes('*update')) {
            result += 'uf';
        } else if (usage.includes('*output') && !usage.includes('*input')) {
            result += 'o ';
        } else {
            result += 'if';
        }

        result += ' ';
        result += usage.includes('*output') && (usage.includes('*input') || usage.includes('*update')) ? 'a' : ' ';
        result += ' e           ';
        result += extra.includes('nokey') ? ' ' : 'k';

        if (extra.includes('nokey')) extra = extra.replace('nokey', '');
        result += ' disk    ' + extra.trim();

        return result;
    };

    private handleNewRpgBlocks(line: string): string {
        // dcl-proc
        let match = line.match(new RegExp(`^dcl-proc ([${PreProcessor.NAME}]+)( export)?;$`));
        if (match) {
            return this.generateLine('p', match[1], match[2] ? 'b                   export' : 'b');
        }

        // end-proc
        if (line.match(/^end-proc;$/)) {
            return 'p                 e';
        }

        // dcl-pi
        match = line.match(/^\s*dcl-pi\s*(.*)\s*;$/);
        if (match) {
            let result = 'd                 pi       ';
            const content = match[1].trim();

            // Check if there\'s a procedure name before the type
            const nameMatch = content.match(/^([a-zA-Z0-9_#@]+)\s+(.+)$/);
            if (nameMatch) {
                result += this.getVariableType(nameMatch[2]);
            } else if (content) {
                result += this.getVariableType(content);
            }

            this.parameters = true;
            return result;
        }

        // dcl-pr
        match = line.match(new RegExp(`^\\s*dcl-pr ([${PreProcessor.NAME}]+)\\s*(.*);$`));
        if (match) {
            this.parameters = true;
            return this.generateLine('d', match[1], 'pr       ' + this.getVariableType(match[2]));
        }

        // dcl-ds
        match = line.match(new RegExp(`^\\s*dcl-ds ([#${PreProcessor.NAME}]+)(.*)?;$`));
        if (match) {
            this.datastructure = true;
            let definition = 'ds';
            if (match[2]) {
                if (match[2].includes('like')) this.datastructure = false;
                definition += ' '.repeat(18) + match[2].trim();
            }
            return this.generateLine('d', match[1], definition);
        }

        // end-ds/pi/pr
        match = line.match(/^\s*end-(ds|pi|pr);$/);
        if (match) {
            if (match[1] === 'ds') {
                this.datastructure = false;
            } else {
                this.parameters = false;
            }
            return '';
        }

        return this.handleNewRpgVariables(line);
    };

    private handleNewRpgVariables(line: string): string {
        const prefix = this.parameters || this.datastructure ? '' : 'dcl-s';
        const match = line.match(new RegExp(`^\\s*${prefix}\\s+([#@]?[${PreProcessor.NAME}]+)\\s+(.*)?;$`));

        if (match) {
            return this.declareVariable(match[1], this.getVariableType(match[2]));
        }

        return line;
    };

    private getVariableType(line: string): string {
        line = line.trim();

        const typeHandlers: Array<{ pattern: RegExp; handler: (m: RegExpMatchArray) => string }> = [
            // char/varchar
            {
                pattern: /^(char|varchar)\(([0-9]+)\)(.*)?$/,
                handler: m => this.declareVariableType('a', m[2], (m[1] === 'varchar' ? ' varying' : '') + (m[3] || ''))
            },
            // int
            {
                pattern: /^int\(([0-9]+)\)(.*)?$/,
                handler: m => this.declareVariableType('i 0', m[1], m[2] || '')
            },
            // unsigned
            {
                pattern: /^unsigned\(([0-9]+)\)(.*)?$/,
                handler: m => this.declareVariableType('u 0', m[1], m[2] || '')
            },
            // packed/zoned/bindec
            {
                pattern: /^(packed|zoned|bindec)\(([0-9]+)(:[0-9])?\)(.*)?$/,
                handler: m => {
                    const typeChar = m[1] === 'packed' ? 'p' : m[1] === 'zoned' ? 's' : 'b';
                    const decimals = m[3] ? m[3].replace(':', ' ') : ' 0';
                    return this.declareVariableType(`${typeChar}${decimals}`, m[2], m[4] || '');
                }
            },
            // bool
            {
                pattern: /^bool(.*)?$/,
                handler: m => this.declareVariableType('n', '', m[1] || '')
            },
            // pointer
            {
                pattern: /^pointer(.*)?$/,
                handler: m => this.declareVariableType('*', '', m[1] || '')
            },
            // timestamp
            {
                pattern: /^timestamp(.*)?$/,
                handler: m => this.declareVariableType('z', '', m[1] || '')
            },
            // date
            {
                pattern: /^date(\([^\)]+\))?(.*)?$/,
                handler: m => this.declareVariableType(`d   ${m[1] ? 'datfmt' + m[1] : ''}`, '', m[2] || '')
            },
            // time
            {
                pattern: /^time(\([^\)]+\))?(.*)?$/,
                handler: m => this.declareVariableType(`t   ${m[1] ? 'timfmt' + m[1] : ''}`, '', m[2] || '')
            },
            // catch-all (like())
            {
                pattern: /^(.*)?$/,
                handler: m => this.declareVariableType('', '', m[1] || '')
            }
        ];

        for (const { pattern, handler } of typeHandlers) {
            const match = line.match(pattern);
            if (match) return handler(match);
        }

        return line;
    };

    private declareVariableType(type: string, length: string, extra: string): string {
        return `${length.padStart(7)}${type.padEnd(4)}${extra.trim()}`;
    };

    private declareVariable(name: string, type: string): string {
        let definition = this.parameters || this.datastructure ? '  ' : 's ';

        if (this.datastructure) {
            const posMatch = type.match(/pos\(([0-9]+)\)/);
            if (posMatch) {
                const pos = posMatch[1];
                definition += pos.padStart(7);
                const extra = type.substring(7).replace(`pos(${pos})`, '');
                type = `${(parseInt(pos) + parseInt(type.substring(0, 7)) - 1).toString().padStart(7)}${extra}`;
            } else {
                definition += ' '.repeat(7);
            }
        } else {
            definition += ' '.repeat(7);
        }

        definition += type;
        return this.generateLine('d', name, definition);
    };

    private generateLine(type: string, name: string, definition: string): string {
        let line = `${type} ${name.padEnd(14)}`;

        if (name.length > 14) {
            if (this.freeFormat) this.switchMode();
            this.appendLine(`${"".padStart(5)}${line}...`);
            line = type + " ".repeat(15);
        }

        if (definition.length > 57) {
            const pos = definition.indexOf('(');
            if (pos > -1) {
                this.appendLine(`${"".padStart(5)}${line}  ${definition.substring(0, pos + 1)}`);
                return type + " ".repeat(37) + definition.substring(pos + 1);
            }
        }

        return line + "  " + definition;
    };
};

export default PreProcessor;
