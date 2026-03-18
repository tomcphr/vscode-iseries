import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import PreProcessor from './packages/iseries-upload/PreProcessor';
import SoapClient from './packages/iseries-upload/SoapClient';
import ErrorParser, { CompileError } from './packages/iseries-upload/ErrorParser';
import * as IseriesRulers from './packages/iseries-rulers/IseriesRulers';

const output = vscode.window.createOutputChannel('Iseries Upload');

export function activate(context: vscode.ExtensionContext) {
	// Activate iseries-rulers functionality (rulers & tab navigation)
	IseriesRulers.activate(context);

	context.subscriptions.push(
		vscode.commands.registerCommand('iseries.upload', () => handleUpload()),
	);

	const config = vscode.workspace.getConfiguration('iseriesUpload');
	if (config.get<boolean>('uploadOnSave')) {
		vscode.workspace.onDidSaveTextDocument((document) => {
			if (!['rpgle', 'dds', 'cl', 'prtf', 'dspf', 'cmd', 'bnd'].includes(document.languageId)) {
				return;
			}
			handleUpload(document);
		});
	}
}

async function handleUpload(document?: vscode.TextDocument) {
	const config = vscode.workspace.getConfiguration('iseriesUpload');
	const server = config.get<string>('server');
	const library = config.get<string>('library');
	const timeout = config.get<number>('timeout');
	const severity = config.get<number>('severity', 0);
	const session = config.get<string>('session');
	const autoCompile = config.get<boolean>('compile');

	if (!library || !session) {
		const errors = [
			!library && 'No library configured',
			!session && 'No session ID configured (6 digit numeric)'
		].filter(Boolean);
		vscode.window.showErrorMessage(
			`${errors.join(', ')}. Update settings in Preferences → Settings → Iseries Upload`
		);
		return;
	}

	const filePath = document?.fileName || await selectFile();
	if (!filePath) {
		return;
	};

	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Iseries Upload",
		cancellable: false
	}, async (progress) => {
		try {
			const { sourcefile, ext, member, sessionId, content, lines, title } =
				await prepareFile(filePath, session!, progress);

			const client = new SoapClient(server!, sessionId, timeout);

			progress.report({ message: 'Creating member...' });
			await client.createMember(library!, sourcefile, member, ext, title);

			progress.report({ message: `Uploading ${lines.length} lines...` });
			await client.uploadSource(library!, sourcefile, member, lines);

			if (!autoCompile || ['qrpglehdr', 'qsrvsrc'].includes(sourcefile.toLowerCase())) {
				vscode.window.showInformationMessage('Source uploaded successfully.');
				return;
			}

			const compiled = await compileSource(client, library!, sourcefile, member, ext, content, severity, document, progress);

			const showProcessed = vscode.workspace.getConfiguration('iseriesUpload').get<string>('openUploadedCode', "On Error");
			if (showProcessed === 'Everytime' || (showProcessed === 'On Error' && !compiled)) {
				const document = await vscode.workspace.openTextDocument({ content: lines.join('\n'), language: 'rpgle' });
				vscode.window.showTextDocument(document);
			}
		} catch (err) {
			vscode.window.showErrorMessage(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	});
}

async function selectFile() {
	const fileUri = await vscode.window.showOpenDialog({
		canSelectMany: false,
		filters: { 'RPGLE': ['rpgle'] },
		openLabel: 'Select RPGLE Source to Upload'
	});
	return fileUri?.[0]?.fsPath;
}

async function prepareFile(filePath: string, session: string, progress: any) {
	progress.report({ message: `Preparing ${path.basename(filePath)}...` });

	const filename = path.basename(filePath);
	const sourcefile = path.basename(path.dirname(filePath));
	const ext = path.extname(filename).replace('.', '');
	const member = filename.replace(/\.[^.]+$/, '');

	const now = new Date();
	const sessionId = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}${session}`;

	progress.report({ message: 'Preprocessing source...' });
	const content = fs.readFileSync(filePath, 'utf-8');
	let rawLines = content.split(/\r?\n/);

	let title = "NO TITLE";
	if (rawLines[0]?.startsWith('#')) {
		title = rawLines[0].substring(1).trim();
		rawLines = rawLines.slice(1);
	}
	const lines = new PreProcessor(rawLines, ext).process();

	return { sourcefile, ext, member, sessionId, content, lines, title };
}

async function compileSource(client: SoapClient, library: string, sourcefile: string,
	member: string, ext: string, content: string, severity: number,
	doc: vscode.TextDocument | undefined, progress: any) {

	progress.report({ message: 'Compiling source...' });

	const isModule = /nomain/i.test(content.substring(0, 500));
	const response = await client.compileProgram(library, sourcefile, member, ext, isModule);
	const body = await response.text();

	if (/faultstring/i.test(body)) {
		const error = body.match(/<faultstring>([\s\S]*?)<\/faultstring>/i)?.[1] || 'Unknown error';
		output.appendLine(`Compile failed: ${error}`);
		output.show(true);
		vscode.window.showErrorMessage(`Compile failed: ${error}`);
		return false;
	}

	if (/<result>1<\/result>/i.test(body)) {
		vscode.window.showInformationMessage('Source compiled successfully.');
		return true;
	}

	if (/<result>0<\/result>/i.test(body)) {
		output.appendLine('Compile completed with errors:');
		output.appendLine(body);
		output.show(true);
		await handleCompileErrors(body, client, severity, doc);
		vscode.window.showWarningMessage(`Compile of ${member} completed with errors. Check output for details.`);
		return false;
	}

	output.appendLine('Compile completed with unknown result:');
	output.appendLine(body);
	output.show(true);
	vscode.window.showWarningMessage('Compile completed with unknown result.');
	return true;
}

async function handleCompileErrors(body: string, client: SoapClient, severity: number, doc?: vscode.TextDocument) {
	const spoolId = body.match(/<spoolid>([\s\S]*?)<\/spoolid>/i)?.[1];
	const jobId = body.match(/<jobid>([\s\S]*?)<\/jobid>/i)?.[1];

	if (!spoolId || !jobId) {
		vscode.window.showErrorMessage('Compile failed, but no spool file info found.');
		return;
	}

	const errorOutputType = vscode.workspace.getConfiguration('iseriesUpload').get<string>('errors.outputType', 'spoolfile');
	try {
		const spoolData = await client.getSpoolFile(spoolId, jobId);
		const errorLines = ErrorParser.decodeEbcdic(spoolData);
		const errors = ErrorParser.parseErrors(errorLines);

		if (errorOutputType === 'spoolfile') {
			output.appendLine('Compile errors:');
			errorLines.forEach(line => output.appendLine(line));
			output.show(true);
		}

		const filteredErrors = errors.filter(e => parseInt(e.severity) >= severity);

		if (filteredErrors.length > 0 && doc && errorOutputType === 'list') {
			await showErrorQuickPick(filteredErrors, doc);
		}

		vscode.window.showErrorMessage(`Compile failed with ${filteredErrors.length} error(s).`);
	} catch (error) {
		vscode.window.showErrorMessage(`Could not retrieve spool file: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

async function showErrorQuickPick(errors: CompileError[], doc: vscode.TextDocument) {
	const items = errors.map(e => ({
		label: `[${e.severity}] ${e.code}`,
		description: e.message,
		error: e
	}));

	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: 'Select an error to navigate to'
	});

	if (selected) {
		const editor = await vscode.window.showTextDocument(doc);
		const line = selected.error.line - 1;
		const start = new vscode.Position(line, Math.max(0, selected.error.startPos));
		const end = new vscode.Position(line, Math.max(0, selected.error.endPos));

		editor.selection = new vscode.Selection(start, end);
		editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
	}
}
