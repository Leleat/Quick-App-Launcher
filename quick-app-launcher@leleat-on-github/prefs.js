"use strict";

const {Gio, GObject, Gtk} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const shellVersion = parseFloat(imports.misc.config.PACKAGE_VERSION);

function init() {
}

function buildPrefsWidget() {
	const prefsWidget = new PrefsWidget();
	shellVersion < 40 && prefsWidget.show_all();
	return prefsWidget;
}

const PrefsWidget = GObject.registerClass(class QuickAppLauncherPrefsWidget extends Gtk.ScrolledWindow {
	_init() {
		super._init({
			hscrollbar_policy: Gtk.PolicyType.NEVER,
			margin_top: 36,
			margin_bottom: 36,
			margin_start: 72,
			margin_end: 72,
		});

		this.settings = ExtensionUtils.getSettings("org.gnome.shell.extensions.quick-app-launcher");

		const box = new Gtk.Box({
			orientation: Gtk.Orientation.VERTICAL,
		});
		_addChildTo(this, box);

		this.listBox = new Gtk.ListBox({
			selection_mode: Gtk.SelectionMode.NONE,
			valign: Gtk.Align.START,
		});
		_addChildTo(box, this.listBox);

		const context = this.listBox.get_style_context();
		const cssProvider = new Gtk.CssProvider();
		context.add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
		context.add_class("frame");

		const addAppRow = new AddAppButtonRow();
		_addChildTo(box, addAppRow);
		addAppRow.addButton.connect("clicked", this._openAppDialog.bind(this));

		this._loadApps();
	}

	_loadApps() {
		_forEachChild(this, this.listBox, row => row.destroy());
		const appIds = this.settings.get_strv("app-list");
		appIds.forEach(id => this._makeNewAppRow(Gio.DesktopAppInfo.new(id)));
	}

	_openAppDialog() {
		// keybindings hardcoded/limited to 30
		if (this.settings.get_strv("app-list").length >= 30)
			return;

		const chooserDialog = new Gtk.AppChooserDialog({
			modal: true
		});

		chooserDialog.get_widget().set({
			show_all: true,
			show_other: true
		});

		chooserDialog.connect("response", (dlg, id) => {
			if (id === Gtk.ResponseType.OK) {
				const appInfo = chooserDialog.get_widget().get_app_info();
				this._makeNewAppRow(appInfo);
				this.settings.set_strv("app-list", [...this.settings.get_strv("app-list"), appInfo.get_id()]);
			}

			chooserDialog.destroy();
		});

		chooserDialog.show();
	}

	_makeNewAppRow(appInfo) {
		const appRow = new AppRow(appInfo);
		_addChildTo(this.listBox, appRow);

		this._makeShortcutEdit(`launch-app${_getChildCount(this.listBox) - 1}`, appRow.treeView, appRow.listStore);

		appRow.deleteButton.connect("clicked", () => {
			// update app-list
			const appList = this.settings.get_strv("app-list");
			appList.splice(appList.indexOf(appInfo.get_id()), 1);
			this.settings.set_strv("app-list", appList);

			// update keybindings: shift bindings below/after deleted appRow one position up/back
			const idx = _getChildIndex(this.listBox, appRow);
			const appCount = _getChildCount(this.listBox);
			[...Array(appCount)].forEach((undef, i) => {
				this.settings.set_strv(`launch-app${i + idx}`
						, i + idx + 1 < 30 ? this.settings.get_strv(`launch-app${i + idx + 1}`) : []);
			});

			// reload GUI
			this._loadApps();
		});
	}

	// taken from Overview-Improved by human.experience
	// https://extensions.gnome.org/extension/2802/overview-improved/
	_makeShortcutEdit(settingKey, treeView, listStore) {
		const COLUMN_KEY = 0;
		const COLUMN_MODS = 1;

		const iter = listStore.append();
		const renderer = new Gtk.CellRendererAccel({xalign: 1, editable: true});
		const column =  new Gtk.TreeViewColumn();
		column.pack_start(renderer, true);
		column.add_attribute(renderer, "accel-key", COLUMN_KEY);
		column.add_attribute(renderer, "accel-mods", COLUMN_MODS);
		treeView.append_column(column);

		const updateShortcutRow = (accel) => {
			// compatibility GNOME 40: GTK4's func returns 3 values / GTK3's only 2
			const array = accel ? Gtk.accelerator_parse(accel) : [0, 0];
			const [key, mods] = [array[array.length - 2], array[array.length - 1]];
			listStore.set(iter, [COLUMN_KEY, COLUMN_MODS], [key, mods]);
		};

		renderer.connect("accel-edited", (renderer, path, key, mods, hwCode) => {
			const accel = Gtk.accelerator_name(key, mods);
			updateShortcutRow(accel);
			this.settings.set_strv(settingKey, [accel]);
		});

		renderer.connect("accel-cleared", () => {
			updateShortcutRow(null);
			this.settings.set_strv(settingKey, []);
		});

		this.settings.connect("changed::" + settingKey, () => {
			updateShortcutRow(this.settings.get_strv(settingKey)[0]);
		});

		updateShortcutRow(this.settings.get_strv(settingKey)[0]);
	}
});

const AppRow = GObject.registerClass(class QuickAppLauncherAppRow extends Gtk.ListBoxRow {
	_init(appInfo) {
		super._init();

		this.appInfo = appInfo;
		this.keybinding = [];

		const box = new Gtk.Box({
			orientation: Gtk.Orientation.HORIZONTAL,
			spacing: 8,
			margin_top: 8,
			margin_bottom: 8,
			margin_start: 8,
			margin_end: 8
		});
		_addChildTo(this, box);

		const icon = new Gtk.Image({
			gicon: appInfo.get_icon(),
			pixel_size: 32,
		});
		_addChildTo(box, icon);

		const label = new Gtk.Label({
			label: appInfo.get_name()
		});
		_addChildTo(box, label);

		this.listStore = new Gtk.ListStore();
		this.listStore.set_column_types([GObject.TYPE_INT, GObject.TYPE_INT]);
		this.treeView = new Gtk.TreeView({
			model: this.listStore,
			halign: Gtk.Align.END,
			hexpand: true,
			valign: Gtk.Align.CENTER,
			headers_visible: false
		});
		_addChildTo(box, this.treeView);

		this.deleteButton = new Gtk.Button();
		if (shellVersion < 40) {
			this.deleteButton.set_always_show_image(true);
			this.deleteButton.set_image(new Gtk.Image({icon_name: "edit-delete-symbolic"}));
		} else {
			this.deleteButton.set_icon_name("edit-delete-symbolic");
		}
		_addChildTo(box, this.deleteButton);

		shellVersion < 40 && this.show_all();
	}

	destroy() {
		shellVersion < 40 ? super.destroy() : this.get_parent().remove(this);
	}
});

const AddAppButtonRow = GObject.registerClass(class QuickAppLauncherAddAppButtonRow extends Gtk.ListBoxRow {
	_init() {
		super._init({
			margin_top: 8,
			margin_bottom: 8
		});

		this.addButton = new Gtk.Button();
		if (shellVersion < 40) {
			this.addButton.set_always_show_image(true);
			this.addButton.set_image(new Gtk.Image({icon_name: "list-add-symbolic"}));
		} else {
			this.addButton.set_icon_name("list-add-symbolic");
		}
		_addChildTo(this, this.addButton);

		shellVersion < 40 && this.show_all();
	}
});

/* --- GTK 4 compatibility --- */

function _getChildCount(container) {
	if (shellVersion < 40)
		return container.get_children().length;

	let childCount = 0;
	for (let child = container.get_first_child(); !!child; child = child.get_next_sibling())
		childCount++;
	return childCount;
}

function _forEachChild(that, container, callback) {
	if (shellVersion < 40) {
		container.foreach(callback.bind(that));

	} else {
		for (let child = container.get_first_child(); !!child;) {
			const nxtSibling = child.get_next_sibling();
			callback.call(that, child);
			child = nxtSibling;
		}
	}
}

function _getChildIndex(container, child) {
	if (shellVersion < 40) {
		return container.get_children().indexOf(child);

	} else {
		let c = container.get_first_child()
		for (let i = 0; c; i++) {
			if (child === c)
				return i;

			c = c.get_next_sibling();
		}
	}

	return -1;
}

function _addChildTo(parent, child) {
	if (parent instanceof Gtk.Box || parent instanceof Gtk.ListBox)
		shellVersion < 40 ? parent.add(child) : parent.append(child);

	else if (parent instanceof Gtk.ListBoxRow || parent instanceof Gtk.ScrolledWindow || parent instanceof Gtk.Frame || parent instanceof Gtk.Overlay)
		shellVersion < 40 ? parent.add(child) : parent.set_child(child);
}
