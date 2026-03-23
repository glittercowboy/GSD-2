import type { ExtensionUIContext } from "../../../core/extensions/index.js";

import { Theme, getAvailableThemesWithPaths, getThemeByName, setTheme, setThemeInstance, theme } from "../theme/theme.js";

export function createExtensionUIContext(host: any): ExtensionUIContext {
	return {
		select: (title, options, opts) => host.showExtensionSelector(title, options, opts),
		confirm: (title, message, opts) => host.showExtensionConfirm(title, message, opts),
		input: (title, placeholder, opts) => host.showExtensionInput(title, placeholder, opts),
		notify: (message, type) => host.showExtensionNotify(message, type),
		onTerminalInput: (handler) => host.addExtensionTerminalInputListener(handler),
		setStatus: (key, text) => host.setExtensionStatus(key, text),
		activity: {
			start: (options) => host.startActivity(options),
			run: (operation, options) => host.runActivity(operation, options),
		},
		setWidget: (key, content, options) => host.setExtensionWidget(key, content, options),
		setFooter: (factory) => host.setExtensionFooter(factory),
		setHeader: (factory) => host.setExtensionHeader(factory),
		setTitle: (title) => host.ui.terminal.setTitle(title),
		custom: (factory, options) => host.showExtensionCustom(factory, options),
		pasteToEditor: (text) => host.editor.handleInput(`\x1b[200~${text}\x1b[201~`),
		setEditorText: (text) => host.editor.setText(text),
		getEditorText: () => host.editor.getText(),
		editor: (title, prefill) => host.showExtensionEditor(title, prefill),
		setEditorComponent: (factory) => host.setCustomEditorComponent(factory),
		get theme() {
			return theme;
		},
		getAllThemes: () => getAvailableThemesWithPaths(),
		getTheme: (name) => getThemeByName(name),
		setTheme: (themeOrName) => {
			if (themeOrName instanceof Theme) {
				setThemeInstance(themeOrName);
				host.ui.requestRender();
				return { success: true };
			}
			const result = setTheme(themeOrName, true);
			if (result.success) {
				if (host.settingsManager.getTheme() !== themeOrName) {
					host.settingsManager.setTheme(themeOrName);
				}
				host.ui.requestRender();
			}
			return result;
		},
		getToolsExpanded: () => host.toolOutputExpanded,
		setToolsExpanded: (expanded) => host.setToolsExpanded(expanded),
	};
}
