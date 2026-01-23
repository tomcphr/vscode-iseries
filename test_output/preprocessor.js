export class PreProcessor {
    static NAME = "a-zA-Z0-9_";
    lines;
    format;
    source = [];
    freeFormat = false;
    compileTimeArray = false;
    parameters = false;
    datastructure = false;
    constructor(lines, format) {
        this.lines = lines;
        this.format = format.toLowerCase();
    }
    process() {
        for (let line of this.lines) {
            line = line.replace(/\r?\n$/, "");
            if (!["dspf", "rpgle", "sqlrpgle"].includes(this.format)) {
                this.appendLine(line);
                continue;
            }
            if (this.format === "dspf") {
                this.handleDisplayLine(line);
                continue;
            }
            if (!this.compileTimeArray && line.slice(0, 2) === "**") {
                this.compileTimeArray = true;
            }
            // Once we've reached a compile time array we don't do any extra processing
            if (this.compileTimeArray) {
                this.source.push(line);
                continue;
            }
            // Remove any hard-coded compiler directives
            if (["/free", "/end-free"].includes(line.trim())) {
                line = "";
            }
            // Convert # comments to // comments (common mistake)
            if (/^\s*#\s/.test(line)) {
                line = line.replace(/^(\s*)#\s/, '$1// ');
            }
            line = this.handleNewRpgFeatures(line);
            // Automatically determine whether this line is free or fixed width.
            // Only process a line if it isn't empty, and if it's not a comment, as they are the same in free/fixed.
            if (line.trim().length > 0 && !/^\s*\//.test(line)) {
                // Create a regex to match fixed column lines
                const regex = new RegExp('^(' +
                    '[chop]' +
                    '|\\s*\\*[^i]' +
                    '|\\s*\\*i.*[^;]$' +
                    '|\\s*\\*$' +
                    '|^d\\s+\\w+.*\\s+(s|ds|pr|pi)\\s' +
                    '|^d\\s+\\w+.*\\s+(s|ds|pr|pi)$' +
                    '|^d\\s.*[^;]$' +
                    '|^d\\*' +
                    '|^f.{11}f' +
                    '|^f.{10}o' +
                    '|^f.{10}i[ps]' +
                    '|^f\\s{30}' +
                    '|^i[^\\s]*$' +
                    '|^i\\s.*[^;]$' +
                    ')', 'i');
                // If it looks like a fixed column line
                if (regex.test(line)) {
                    if (this.freeFormat) {
                        this.switchMode();
                    }
                }
                else {
                    // If it looks like a free format line
                    if (!this.freeFormat) {
                        this.switchMode();
                    }
                }
            }
            // Remove any 'reference' parameter pass rules, as this is a regatta-specific RPG keyword
            line = line.replace(/^(d.{26} ([ 0-9]{6}[apin]| {7}) [ 0-9] )reference/i, "$1");
            line = this.autoIndent(line);
            this.appendLine(line);
        }
        return this.source;
    }
    handleDisplayLine(line) {
        if (line.length > 0 && (line[0] === "A" || line[0] === "a")) {
            this.source.push("     " + line);
            return;
        }
        if (line.length > 1 && line.slice(0, 2) === "//") {
            this.source.push("      *" + line.slice(2));
            return;
        }
        this.source.push(line);
    }
    switchMode() {
        if (this.source.length > 0) {
            const lastLine = this.source.pop();
            if (lastLine.trim().length > 0) {
                this.source.push(lastLine);
            }
        }
        let insertLine;
        if (this.freeFormat) {
            insertLine = "/end-free";
            this.freeFormat = false;
        }
        else {
            insertLine = "/free";
            this.freeFormat = true;
        }
        this.source.push("      " + insertLine);
    }
    autoIndent(line) {
        // Handle the auto-indentation
        const regexes = [];
        if (this.freeFormat) {
            // Free format comments
            regexes.push(["\/\/", 7]);
            // Compiler directives (/copy)
            regexes.push(["\/", 6]);
            // Free format code
            regexes.push(["[^ ]", 7]);
        }
        else {
            // Free format style comments (these are valid in column based if they start in column 7)
            regexes.push(["\/\/", 6]);
            // Compiler directives (/copy) and column based comments (* Comment)
            regexes.push(["[\/\\*]", 6]);
            // Column based code
            regexes.push(["[cdfhiop]", 5]);
        }
        for (const [regexStr, length] of regexes) {
            const regex = new RegExp(`^( {0,${length}})${regexStr}`, 'i');
            const match = line.match(regex);
            if (match) {
                const padding = length - match[1].length;
                line = " ".repeat(padding) + line;
                break;
            }
        }
        return line;
    }
    appendLine(line) {
        if (line.length > 100) {
            line = line.slice(0, 100);
        }
        this.source.push(line);
    }
    handleNewRpgFeatures(line) {
        let match = line.match(new RegExp(`^\\s*dcl-c ([${PreProcessor.NAME}]+) (.*);$`));
        if (match) {
            return this.generateLine("d", match[1], `c                   const(${match[2]})`);
        }
        match = line.match(/^ctl-opt (.*);$/);
        if (match) {
            return "h " + match[1];
        }
        return this.handleNewRpgTables(line);
    }
    handleNewRpgTables(line) {
        let match = line.match(new RegExp(`^\\s*dcl-f ([${PreProcessor.NAME}]+)(.*)?;$`));
        if (match) {
            let l = `f${match[1].padEnd(10)}`;
            let extra = match[2] || "";
            const usageSearch = /usage\(([^)]*)\)/i;
            const usageMatch = extra.match(usageSearch);
            let usage = usageMatch ? usageMatch[1] : "";
            if (usageMatch)
                extra = extra.replace(usageSearch, "");
            if (usage.includes("*update"))
                l += "uf";
            else if (usage.includes("*output") && !usage.includes("*input"))
                l += "o ";
            else
                l += "if";
            l += " ";
            if (usage.includes("*output") && (usage.includes("*input") || usage.includes("*update")))
                l += "a";
            else
                l += " ";
            l += " e           ";
            if (extra.includes("nokey")) {
                extra = extra.replace("nokey", "");
                l += " ";
            }
            else {
                l += "k";
            }
            l += " disk    " + extra.trim();
            return l;
        }
        return this.handleNewRpgBlocks(line);
    }
    handleNewRpgBlocks(line) {
        let match = line.match(new RegExp(`^\\s*dcl-proc ([${PreProcessor.NAME}]+)( export)?;$`));
        if (match) {
            let definition = "b";
            if (match[2])
                definition += "                   export";
            return this.generateLine("p", match[1], definition);
        }
        if (/^end-proc;$/.test(line)) {
            return "p                 e";
        }
        match = line.match(/^\s*dcl-pi(.*);$/);
        if (match) {
            // Skip empty dcl-pi; (just marks end of parameters)
            if (match[1].trim() === "") {
                this.parameters = false;
                return "";
            }
            let l = "d                 pi       ";
            l += this.getVariableType(match[1]);
            this.parameters = true;
            return l;
        }
        match = line.match(new RegExp(`^\\s*dcl-pr ([${PreProcessor.NAME}]+)\\s*(.*);$`));
        if (match) {
            let l = this.generateLine("d", match[1], "pr       " + this.getVariableType(match[2]));
            this.parameters = true;
            return l;
        }
        match = line.match(new RegExp(`^\\s*dcl-ds ([#${PreProcessor.NAME}]+)(.*)?;$`));
        if (match) {
            this.datastructure = true;
            let definition = "ds";
            if (match[2]) {
                if (match[2].includes("like"))
                    this.datastructure = false;
                definition += " ".repeat(18) + match[2].trim();
            }
            return this.generateLine("d", match[1], definition);
        }
        match = line.match(/^\s*end-(ds|pi|pr);$/);
        if (match) {
            if (match[1] === "ds")
                this.datastructure = false;
            else
                this.parameters = false;
            return "";
        }
        return this.handleNewRpgVariables(line);
    }
    handleNewRpgVariables(line) {
        let prefix;
        if (this.parameters || this.datastructure) {
            prefix = "";
        }
        else {
            prefix = "dcl-s";
        }
        const regex = new RegExp(`^\\s*${prefix}\\s+([#@]?[${PreProcessor.NAME}]+)\\s+(.*)?;$`);
        const match = line.match(regex);
        if (match) {
            const variableType = this.getVariableType(match[2] || "");
            return this.declareVariable(match[1], variableType);
        }
        return line;
    }
    getVariableType(line) {
        if (!line)
            return "";
        line = line.trim();
        let match;
        // Alpha fields, fixed and varying length
        if ((match = line.match(/^(char|varchar)\(([0-9]+)\)(.*)?$/))) {
            let extra = match[3] || "";
            if (match[1] === "varchar") {
                extra += " varying";
            }
            return this.declareVariableType("a", match[2], extra);
        }
        // Integers
        if ((match = line.match(/^int\(([0-9]+)\)(.*)?$/))) {
            return this.declareVariableType("i 0", match[1], match[2] || "");
        }
        // Unsigned integers
        if ((match = line.match(/^unsigned\(([0-9]+)\)(.*)?$/))) {
            return this.declareVariableType("u 0", match[1], match[2] || "");
        }
        // Packed decimals
        if ((match = line.match(/^packed\(([0-9]+)(:[0-9])?\)(.*)?$/))) {
            let decimals;
            if (match[2]) {
                decimals = match[2].replace(":", " ");
            }
            else {
                decimals = " 0";
            }
            return this.declareVariableType(`p${decimals}`, match[1], match[3] || "");
        }
        // Signed decimals
        if ((match = line.match(/^zoned\(([0-9]+)(:[0-9])?\)(.*)?$/))) {
            let decimals;
            if (match[2]) {
                decimals = match[2].replace(":", " ");
            }
            else {
                decimals = " 0";
            }
            return this.declareVariableType(`s${decimals}`, match[1], match[3] || "");
        }
        // Binary decimals
        if ((match = line.match(/^bindec\(([0-9]+)(:[0-9])?\)(.*)?$/))) {
            let decimals;
            if (match[2]) {
                decimals = match[2].replace(":", " ");
            }
            else {
                decimals = " 0";
            }
            return this.declareVariableType(`b${decimals}`, match[1], match[3] || "");
        }
        // Booleans (indicators)
        if ((match = line.match(/^bool(.*)?$/))) {
            return this.declareVariableType("n", "", match[1] || "");
        }
        // Pointers (*)
        if ((match = line.match(/^pointer(.*)?$/))) {
            return this.declareVariableType("*", "", match[1] || "");
        }
        // Timestamp
        if ((match = line.match(/^timestamp(.*)?$/))) {
            return this.declareVariableType("z", "", match[1] || "");
        }
        // Date
        if ((match = line.match(/^date(\([^\)]+\))?(.*)?$/))) {
            let format;
            if (match[1]) {
                format = "datfmt" + match[1];
            }
            else {
                format = "";
            }
            return this.declareVariableType(`d   ${format}`, "", match[2] || "");
        }
        // Time
        if ((match = line.match(/^time(\([^\)]+\))?(.*)?$/))) {
            let format;
            if (match[1]) {
                format = "timfmt" + match[1];
            }
            else {
                format = "";
            }
            return this.declareVariableType(`t   ${format}`, "", match[2] || "");
        }
        // Catch all (usually a like())
        if ((match = line.match(/^(.*)?$/))) {
            return this.declareVariableType("", "", match[1] || "");
        }
        return line;
    }
    declareVariableType(type, length, extra) {
        return `${length.padStart(7)}${type.padEnd(4)}${extra.trim()}`;
    }
    declareVariable(name, type) {
        let definition;
        if (this.parameters || this.datastructure) {
            definition = "  ";
        }
        else {
            definition = "s ";
        }
        if (this.datastructure) {
            const posMatch = type.match(/pos\(([0-9]+)\)/);
            if (posMatch) {
                const pos = posMatch[1];
                definition += pos.padStart(7);
                const extra = type.slice(7).replace(`pos(${pos})`, "");
                const endPos = parseInt(pos) + parseInt(type.slice(0, 7)) - 1;
                type = `${endPos.toString().padStart(7)}${extra}`;
            }
            else {
                definition += " ".repeat(7);
            }
        }
        else {
            definition += " ".repeat(7);
        }
        definition += type;
        return this.generateLine("d", name, definition);
    }
    generateLine(type, name, definition) {
        let line = `${type} ${name.padEnd(14, ' ')}`;
        if (name.length > 14) {
            if (this.freeFormat) {
                this.switchMode();
            }
            this.appendLine(`     ${line}...`);
            line = type + " ".repeat(15);
        }
        if (definition.length > 57) {
            const pos = definition.indexOf('(');
            if (pos > -1) {
                const pos1 = pos + 1;
                this.appendLine(`     ${line}  ${definition.slice(0, pos1)}`);
                return type + " ".repeat(37) + definition.slice(pos1);
            }
        }
        return line + "  " + definition;
    }
}
