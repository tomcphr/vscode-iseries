import * as vscode from 'vscode';

const TYPE_RULERS: Record<string, number[]> = {
	"C": [1, 6, 20, 30, 44, 63, 65, 67, 69],
	"D": [1, 3, 18, 20, 27, 34, 38],
	"F": [1, 11, 14, 16, 28, 30, 38],
	"I": [1, 15, 43],
	"H": [2],
	"O": [1, 3, 11, 24, 31, 37, 40, 46, 47, 73],
	"P": [2, 18, 38]
};

let currentRulers: number[] = [];

/**
 * Updates rulers based on the current line's spec type (C, D, F, H, I, O, P)
 */
export function updateRulers(editor: vscode.TextEditor | undefined): void {
	if (!editor) {
		return;
	}

	// Reset rulers for non-RPGLE files
	if (editor.document.languageId !== 'rpgle') {
		currentRulers = [];
		applyRulers(editor, []);
		return;
	}

	const position = editor.selection.active;
	const line = editor.document.lineAt(position.line).text;

	// Match spec type only at true line start (column 0) or traditional RPG position (columns 5-6)
	const match = line.match(/^([cdfhiop])|^ {5,6}([cdfhiop])/i);

	if (match) {
		// match[1] is column 0 spec, match[2] is traditional position spec
		const specType = (match[1] || match[2]).toUpperCase();
		const baseRulers = TYPE_RULERS[specType];

		if (baseRulers) {
			// Adjust rulers based on leading whitespace
			const leadingSpaces = match[0].length - 1;
			currentRulers = leadingSpaces > 0
				? baseRulers.map(r => r + leadingSpaces)
				: [...baseRulers];

			applyRulers(editor, currentRulers);
			return;
		}
	}

	// Free format - no rulers
	currentRulers = [];
	applyRulers(editor, []);
}

function applyRulers(editor: vscode.TextEditor, rulers: number[]): void {
	// Update editor rulers configuration for the current workspace
	const config = vscode.workspace.getConfiguration('editor', editor.document.uri);
	config.update('rulers', rulers, vscode.ConfigurationTarget.Workspace);
}

/**
 * Get current rulers for the active editor
 */
export function getCurrentRulers(): number[] {
	return currentRulers;
}

/**
 * Tab command - moves to next ruler position or inserts spaces in free format
 */
export async function iseriesTab(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'rpgle') {
		// Fall back to default tab behavior
		await vscode.commands.executeCommand('tab');
		return;
	}

	const position = editor.selection.active;
	const line = editor.document.lineAt(position.line);
	const column = position.character;

	// Update rulers for current line
	updateRulers(editor);
	const rulers = getCurrentRulers();

	// Free format - insert 2 spaces (tab stop)
	if (rulers.length === 0) {
		const spaces = 2 - (column % 2);
		await editor.edit(editBuilder => {
			editBuilder.insert(position, ' '.repeat(spaces));
		});
		return;
	}

	// Find next ruler after current position
	for (const ruler of rulers) {
		if (ruler > column) {
			const targetPosition = new vscode.Position(position.line, ruler);

			// If ruler is beyond end of line, pad with spaces
			if (ruler > line.text.length) {
				await editor.edit(editBuilder => {
					const padding = ' '.repeat(ruler - line.text.length);
					editBuilder.insert(line.range.end, padding);
				});
			}

			// Move cursor to ruler position
			editor.selection = new vscode.Selection(targetPosition, targetPosition);
			return;
		}
	}

	// No more rulers - move to start of next line
	const nextLine = position.line + 1;
	if (nextLine >= editor.document.lineCount) {
		// At end of file - add a new line
		await editor.edit(editBuilder => {
			editBuilder.insert(line.range.end, '\n');
		});
	}

	const newPosition = new vscode.Position(nextLine, 0);
	editor.selection = new vscode.Selection(newPosition, newPosition);
}

/**
 * Shift+Tab command - moves to previous ruler position
 */
export async function iseriesTabBack(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'rpgle') {
		// Fall back to default outdent behavior
		await vscode.commands.executeCommand('outdent');
		return;
	}

	const position = editor.selection.active;
	const line = editor.document.lineAt(position.line);
	const column = position.character;

	// Update rulers for current line
	updateRulers(editor);
	const rulers = getCurrentRulers();

	// Free format
	if (rulers.length === 0) {
		// Check if we have whitespace before cursor
		const prefix = line.text.substring(0, column);
		if (/^\s+$/.test(prefix)) {
			// Delete back to previous 2-space tab stop
			const chars = column % 2 === 0 ? 2 : column % 2;
			await editor.edit(editBuilder => {
				const deleteRange = new vscode.Range(
					new vscode.Position(position.line, column - chars),
					position
				);
				editBuilder.delete(deleteRange);
			});
		}
		return;
	}

	// Find previous ruler position
	let previousRuler: number | null = null;
	for (const ruler of rulers) {
		if (ruler < column) {
			previousRuler = ruler;
		} else {
			break;
		}
	}

	if (previousRuler !== null) {
		// Move to previous ruler
		const newPosition = new vscode.Position(position.line, previousRuler);
		editor.selection = new vscode.Selection(newPosition, newPosition);
		return;
	}

	// No previous ruler - move to start of line
	if (column > 0) {
		const newPosition = new vscode.Position(position.line, 0);
		editor.selection = new vscode.Selection(newPosition, newPosition);
		return;
	}

	// Already at start of line - move to end of previous line
	if (position.line > 0) {
		const prevLine = editor.document.lineAt(position.line - 1);
		const newPosition = new vscode.Position(position.line - 1, prevLine.text.length);
		editor.selection = new vscode.Selection(newPosition, newPosition);
	}
}

/**
 * Register all iseries-rulers functionality
 */
export function activate(context: vscode.ExtensionContext): void {
	// Update rulers on selection change
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection(event => {
			updateRulers(event.textEditor);
		})
	);

	// Update rulers when active editor changes
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			updateRulers(editor);
		})
	);

	// Register tab command
	context.subscriptions.push(
		vscode.commands.registerCommand('iseries.tab', iseriesTab)
	);

	// Register shift+tab command
	context.subscriptions.push(
		vscode.commands.registerCommand('iseries.tabBack', iseriesTabBack)
	);

	// Initial ruler update
	updateRulers(vscode.window.activeTextEditor);
}
