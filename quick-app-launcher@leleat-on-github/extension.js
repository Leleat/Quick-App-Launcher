/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

"use strict";

const {main} = imports.ui;
const {Meta, Shell} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;

class Extension {
	constructor() {
	}

	enable() {
		this.settings = ExtensionUtils.getSettings("org.gnome.shell.extensions.quick-app-launcher");

		this.keyBindings = [];
		// hardcode/limit to 30 keybindings
		[...Array(30)].forEach((undef, idx) => this.keyBindings.push(`launch-app${idx}`));
		this.keyBindings.forEach(key => {
			main.wm.addKeybinding(key, this.settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, Shell.ActionMode.NORMAL
					, this.onKeybindingPressed.bind(this, key));
		});
	}

	disable() {
		this.keyBindings.forEach(key => main.wm.removeKeybinding(key));
		this.settings.run_dispose();
		this.settings = null;
	}

	onKeybindingPressed(shortcutName) {
		// remove "launch-app" from the string
		const idx = Number.parseInt(shortcutName.substring(10));
		const appID = this.settings.get_strv("app-list")[idx];
		const app = Shell.AppSystem.get_default().lookup_app(appID);
		if (!app)
			return;

		const winTracker = Shell.WindowTracker.get_default();
		const window = global.display.focus_window;
		// open a new window, if the focused window is already an instance of the app
		window && winTracker.get_window_app(window) === app ? app.open_new_window(-1) : app.activate();
	}
}

function init() {
	return new Extension();
}
