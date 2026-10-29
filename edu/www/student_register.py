# Copyright (c) 2026, Vinayak and contributors
# License: MIT. See license.txt

import frappe
from frappe import _
from urllib.parse import quote

no_cache = 1


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=" + quote("/student-register")
		raise frappe.Redirect

	if not frappe.has_permission("Student", "read"):
		frappe.throw(_("You do not have permission to open the student register."), frappe.PermissionError)

	context.no_cache = 1
	context.safe_render = False
	context.title = _("Student Register")
	context.company = frappe.defaults.get_global_default("company") or _("School")
	context.full_name = frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user
	context.boot_json = frappe.as_json(context.boot)
