# Copyright (c) 2026, Vinayak and contributors
# License: MIT. See license.txt

import frappe

# Nested under the last section of the Setup sidebar, which is Settings.
UPDATE_ITEM = {
	"type": "Link",
	"label": "Update Edu",
	"link_type": "DocType",
	"link_to": "Edu Settings",
	"child": 1,
	"collapsible": 1,
	"indent": 0,
	"keep_closed": 0,
	"open_in_new_tab": 0,
	"show_arrow": 0,
}


def after_migrate():
	if not frappe.db.exists("DocType", "Edu Settings"):
		return
	from frappe.desk.doctype.custom_sidebar.custom_sidebar import add_site_sidebar_item

	add_site_sidebar_item("Setup", UPDATE_ITEM)
