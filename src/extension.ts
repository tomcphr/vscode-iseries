// Dynamic RPGLE rulers logic
const typeRulers: Record<string, number[]> = {
	C: [1, 6, 20, 30, 44, 63, 65, 67, 69],
	D: [1, 3, 18, 20, 27, 34, 38],
	F: [1, 11, 14, 16, 28, 30, 38],
	I: [1, 15, 43],
	H: [2],
	O: [1, 3, 11, 24, 31, 37, 40, 46, 47, 73],
	P: [2, 18, 38],
};
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { PreProcessor } from './preprocessor';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import * as base64 from 'base-64';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const helloDisposable = vscode.commands.registerCommand('sublime-packages-port.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Sublime Packages Port!');
	});

	const uploadDisposable = vscode.commands.registerCommand('rpgle.upload', async () => {
		await handleRPGLEUpload();
	});

	const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
		if (document.languageId === 'rpgle') {
			await handleRPGLEUpload(document);
		}
	});

	// Dynamic rulers for RPGLE
	const cursorListener = vscode.window.onDidChangeTextEditorSelection((event) => {
		const editor = event.textEditor;
		if (editor.document.languageId !== 'rpgle') {
			return;
		};
		const line = editor.document.lineAt(editor.selection.active.line).text;
		const match = line.match(/^\s{0,5}([cdfhiop])/i);
		if (match) {
			const char = match[1].toUpperCase();
			let rulers = typeRulers[char];
			const length = match[0].length - 1;
			if (length > 0) rulers = rulers.map(x => x + length);
			editor.options = { ...editor.options, rulers };
		} else {
			editor.options = { ...editor.options, rulers: [] };
		}
	});

	context.subscriptions.push(helloDisposable, uploadDisposable, saveListener, cursorListener);
}

const outputChannel = vscode.window.createOutputChannel('RPGLE Upload');

async function handleRPGLEUpload(document?: vscode.TextDocument) {
	const config = vscode.workspace.getConfiguration();
	const server = config.get<string>('rpgleUpload.server');
	const library = config.get<string>('rpgleUpload.library');
	const timeout = config.get<number>('rpgleUpload.timeout');
	const severity = config.get<number>('rpgleUpload.severity');
	const session = config.get<string>('rpgleUpload.session');
	const autoCompile = config.get<boolean>('rpgleUpload.compile');

	let error = '';
	if (!library || library.length < 1) {
		error = 'No library setup, you must define which library you want to upload and compile your source in.\n\n';
	}
	if (!session || session.length < 1) {
		error += 'No session setup, you must define a 6 digit numeric session id to avoid clashing sessions with other developers.\n\n';
	}
	if (error.length > 0) {
		vscode.window.showErrorMessage(error + 'Adjust your settings in Preferences → Settings → RPGLE Upload');
		return;
	}

	let filePath = '';
	if (document) {
		filePath = document.fileName;
	} else {
		const fileUri = await vscode.window.showOpenDialog({
			canSelectMany: false,
			filters: { 'RPGLE': ['rpgle'] },
			openLabel: 'Select RPGLE Source to Upload'
		});
		if (fileUri && fileUri[0]) {
			filePath = fileUri[0].fsPath;
		} else {
			vscode.window.showWarningMessage('No RPGLE file selected for upload.');
			return;
		}
	}
	try {
		vscode.window.showInformationMessage(`Uploading: ${filePath}`);
		// Extract file info
		const filename = path.basename(filePath);
		const sourcefile = path.basename(path.dirname(filePath));
		const ext = path.extname(filename).replace('.', '');
		const member = filename.replace(/\.[^.]+$/, '');
		const now = new Date();
		const sessionId = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}${session}`;

		// Read file lines
		const fileContent = fs.readFileSync(filePath, 'utf-8');
		let lines = fileContent.split(/\r?\n/);
		// Preprocess (now async for include search)
		lines = await new PreProcessor(lines, ext).process();

		// Prepare SOAP headers
		const headers = {
			'Content-Type': 'text/xml;charset=iso-8859-1',
			'SOAPAction': `http://${server}.regatta.com:7024/getData`
		};

		// Create member
		let xml = `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns="http://${server}.regatta.com:7024/"><SOAP-ENV:Body><getData>`;
		xml += `<library>${library}</library>`;
		xml += `<sourcefile>${sourcefile}</sourcefile>`;
		xml += `<member>${member}</member>`;
		xml += `<sourcetype>${ext}</sourcetype>`;
		xml += `<title>${member}</title>`;
		xml += `</getData></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
		let resp = await fetch(`http://${server}.regatta.com:7024/.${sessionId}/api/createMember.asmx`, {
			method: 'POST',
			headers,
			body: xml,
			timeout: (timeout || 30) * 1000
		});
		if (!resp.ok) throw new Error('Error creating member');
		// Upload source
		xml = `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns="http://${server}.regatta.com:7024/"><SOAP-ENV:Body><getData>`;
		xml += `<library>${library}</library>`;
		xml += `<sourcefile>${sourcefile}</sourcefile>`;
		xml += `<member>${member}</member>`;
		let seq = 1;
		for (const line of lines) xml += `<sequence>${seq++}</sequence>`;
		seq = 1;
		for (const line of lines) xml += `<data>${base64.encode(line.padEnd(100))}</data>`;
		seq = 1;
		for (const line of lines) xml += `<date>000000</date>`;
		xml += `</getData></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
		resp = await fetch(`http://${server}.regatta.com:7024/.${sessionId}/api/putSource.asmx`, {
			method: 'POST',
			headers,
			body: xml,
			timeout: (timeout || 30) * 1000
		});
		if (!resp.ok) throw new Error('Error uploading source');
		vscode.window.showInformationMessage('Source uploaded successfully.');
		if (autoCompile) {
			// Compile logic
			let xml = `<SOAP-ENV:Envelope xmlns:SOAP-ENV=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns=\"http://${server}.regatta.com:7024/\"><SOAP-ENV:Body><getData>`;
			xml += `<sourcelib>${library}</sourcelib>`;
			xml += `<sourcefile>${sourcefile}</sourcefile>`;
			xml += `<sourcetype>${ext}</sourcetype>`;
			xml += `<module>0</module>`;
			xml += `<member>${member}</member>`;
			xml += `<objectlib>${library}</objectlib>`;
			xml += `</getData></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
			const resp = await fetch(`http://${server}.regatta.com:7024/.${sessionId}/api/compileProgram.asmx`, {
				method: 'POST',
				headers,
				body: xml,
				timeout: (timeout || 30) * 1000
			});
			const body = await resp.text();
			if (!resp.ok) {
				outputChannel.appendLine('Compile failed (HTTP error). Full response:');
				outputChannel.appendLine(body);
				outputChannel.show(true);
				vscode.window.showErrorMessage('Compile failed (HTTP error). See RPGLE Upload output for details.');
			} else if (/faultstring/i.test(body)) {
				const match = body.match(/<faultstring>([\s\S]*?)<\/faultstring>/i);
				const msg = match ? match[1] : 'Unknown compile error.';
				outputChannel.appendLine('Compile failed. Full response:');
				outputChannel.appendLine(body);
				outputChannel.show(true);
				vscode.window.showErrorMessage(`Compile failed: ${msg} (See RPGLE Upload output for details.)`);
			} else if (/<result>1<\/result>/i.test(body)) {
				vscode.window.showInformationMessage('Source compiled successfully.');
			} else if (/<result>0<\/result>/i.test(body)) {
				// Extract spoolid and jobid
				const spoolMatch = body.match(/<spoolid>([\s\S]*?)<\/spoolid>/i);
				const jobMatch = body.match(/<jobid>([\s\S]*?)<\/jobid>/i);
				const spoolid = spoolMatch ? spoolMatch[1] : '';
				const jobid = jobMatch ? jobMatch[1] : '';
				if (spoolid && jobid) {
					const params = `spoolid=${encodeURIComponent(spoolid)}&jobid=${encodeURIComponent(jobid)}`;
					const spoolUrl = `http://${server}.regatta.com:7024/.${sessionId}/programs/getSpoolFile.aspx?${params}`;
					try {
						const spoolResp = await fetch(spoolUrl, { timeout: (timeout || 30) * 1000 });
						const spoolData = await spoolResp.text();
						// EBCDIC hex decode logic
						const charset: Record<string, string> = {
							"40": " ", "43": "ä", "45": "á", "47": "å", "49": "ñ", "4B": ".", "4C": "<", "4D": "(", "4E": "+", "53": "ë", "59": "ß", "5B": "$", "5C": "*", "5D": ")", "5E": ";", "60": "-", "61": "/", "6B": ",", "6C": "%", "6D": "_", "6E": ">", "6F": "?", "70": "ø", "7A": ":", "7B": "#", "7C": "@", "7D": "'", "7E": "=", "80": "Ø", "81": "a", "82": "b", "83": "c", "84": "d", "85": "e", "86": "f", "87": "g", "88": "h", "89": "i", "8E": "þ", "90": "°", "91": "j", "92": "k", "93": "l", "94": "m", "95": "n", "96": "o", "97": "p", "98": "q", "99": "r", "A0": "µ", "A2": "s", "A3": "t", "A4": "u", "A5": "v", "A6": "w", "A7": "x", "A8": "y", "A9": "z", "B0": "^", "BB": "]", "BE": "´", "C0": "{", "C1": "A", "C2": "B", "C3": "C", "C4": "D", "C5": "E", "C6": "F", "C7": "G", "C8": "H", "C9": "I", "D0": "\\", "D1": "J", "D2": "K", "D3": "L", "D4": "M", "D5": "N", "D6": "O", "D7": "P", "D8": "Q", "D9": "R", "E0": "}", "E2": "S", "E3": "T", "E4": "U", "E5": "V", "E6": "W", "E7": "X", "E8": "Y", "E9": "Z", "F0": "0", "F1": "1", "F2": "2", "F3": "3", "F4": "4", "F5": "5", "F6": "6", "F7": "7", "F8": "8", "F9": "9", "FA": "³", "FB": "Û", "FD": "Ù", "FF": "□"
						};
						let data = spoolData.trim();
						data += "15"; // Force a line break at the end
						let errors: string[] = [];
						let line = "";
						let i = 0;
						while (i < data.length) {
							const key = data.substr(i, 2).toUpperCase();
							let char = "";
							if (["00", "0D"].includes(key)) {
								char = "";
							} else if (["0C", "15"].includes(key)) {
								if (line.trim().length > 0) errors.push(line);
								line = "";
								char = "";
							} else if (key === "34") {
								char = "";
								i += 4;
							} else {
								char = charset[key] || `[${key}]`;
							}
							line += char;
							i += 2;
						}
						outputChannel.appendLine('Compile errors (decoded spool file):');
						errors.forEach(e => outputChannel.appendLine(e));
						outputChannel.show(true);
						// Open errors in a new tab
						const doc = await vscode.workspace.openTextDocument({
							content: errors.join('\n'),
							language: 'log'
						});
						await vscode.window.showTextDocument(doc, { preview: false });
						vscode.window.showErrorMessage('Compile failed. Errors opened in a new tab.');
					} catch (e) {
						vscode.window.showErrorMessage('Compile failed and could not retrieve spool file.');
					}
				} else {
					vscode.window.showErrorMessage('Compile failed, but no spool file info found.');
				}
			} else {
				outputChannel.appendLine('Compile completed with unknown result. Full response:');
				outputChannel.appendLine(body);
				outputChannel.show(true);
				vscode.window.showWarningMessage('Compile completed with unknown result. See RPGLE Upload output for details.');
			}
		}
	} catch (err: any) {
		vscode.window.showErrorMessage(`Upload failed: ${err.message}`);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
