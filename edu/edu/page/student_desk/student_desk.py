# Copyright (c) 2026, Vinayak and contributors
# License: MIT. See license.txt

import frappe
from frappe import _
from frappe.utils import cint

DATA_FIELDS = (
	"student_id",
	"status",
	"gender",
	"student_name",
	"last_name",
	"father_name",
	"mother_name",
	"grandfather_name",
	"place_of_birth",
	"nationality",
	"civil_registry_office",
	"place_of_registration",
	"registration_number",
	"national_id",
	"school_section",
	"class_division",
	"education_ministry_id",
	"general_register_no",
	"previous_school",
	"governorate",
	"district",
	"subdistrict",
	"street",
	"address_line_1",
	"address_line_2",
	"father_phone",
	"mother_phone",
	"withdrawal_reason",
	"notes",
)
DATE_FIELDS = ("date_of_birth", "registration_date", "withdrawal_date")
INT_FIELDS = ("family_sequence", "siblings_in_school")
CHECK_FIELDS = (
	"needs_transport",
	"needs_meal",
	"has_dossier",
	"has_documents",
	"has_ninth_certificate",
	"is_orphan",
	"is_martyrs_child",
	"fees_paid",
)
LINK_FIELDS = {"grade": "Grade", "transport_line": "Transport Line"}
READ_FIELDS = ("name", "docstatus", "customer", "sales_invoice", "amended_from")


@frappe.whitelist()
def search_students(query=None, grade=None, status=None):
	frappe.has_permission("Student", "read", throw=True)
	text = (query or "").strip()
	conditions = ["docstatus != 2"]
	values = {}
	grade = (grade or "").strip()
	if grade:
		conditions.append("grade = %(grade)s")
		values["grade"] = grade
	if status == "Draft":
		conditions.append("docstatus = 0")
	elif status == "Submitted":
		conditions.append("docstatus = 1")
	if text:
		conditions.append(
			"""(
				student_id like %(q)s
				or student_name like %(q)s
				or last_name like %(q)s
				or national_id like %(q)s
				or name like %(q)s
				or concat_ws(' ', ifnull(student_name, ''), ifnull(last_name, '')) like %(q)s
			)"""
		)
		values["q"] = f"%{text}%"
	return frappe.db.sql(
		f"""
		select name, student_id, student_name, last_name, grade, transport_line,
			status, docstatus, school_section
		from `tabStudent`
		where {" and ".join(conditions)}
		order by modified desc
		limit 50
		""",
		values,
		as_dict=True,
	)


@frappe.whitelist()
def get_form_options():
	frappe.has_permission("Student", "read", throw=True)
	return {
		"grades": frappe.get_all(
			"Grade",
			fields=["name", "grade_name", "description"],
			order_by="grade_name asc",
		),
		"transport_lines": frappe.get_all(
			"Transport Line",
			fields=["name", "line_number", "area", "vehicle_type"],
			order_by="line_number asc",
		),
	}


@frappe.whitelist()
def get_student(name):
	if not name or not frappe.db.exists("Student", name):
		frappe.throw(_("Student {0} was not found.").format(frappe.bold(name)))
	doc = frappe.get_doc("Student", name)
	doc.check_permission("read")
	return _payload(doc)


@frappe.whitelist()
def save_student(data):
	data = _as_dict(data)
	name = (data.get("name") or "").strip()
	if name and frappe.db.exists("Student", name):
		doc = frappe.get_doc("Student", name)
		doc.check_permission("write")
		if doc.docstatus != 0:
			frappe.throw(_("Submitted students are changed from the Student document."))
		incoming_id = (data.get("student_id") or "").strip()
		if incoming_id and incoming_id != doc.student_id:
			frappe.throw(_("Student ID cannot be changed from this page."))
		_apply(doc, data, include_id=False)
		doc.save()
	else:
		frappe.has_permission("Student", "create", throw=True)
		doc = frappe.new_doc("Student")
		_apply(doc, data, include_id=True)
		doc.insert()
	doc.check_permission("submit")
	doc.submit()
	doc.reload()
	return _payload(doc)


def _as_dict(data):
	if isinstance(data, str):
		data = frappe.parse_json(data)
	return frappe._dict(data or {})


def _apply(doc, data, include_id):
	fields = DATA_FIELDS if include_id else tuple(field for field in DATA_FIELDS if field != "student_id")
	for field in fields:
		value = data.get(field)
		text = value.strip() if isinstance(value, str) else value
		doc.set(field, text or None)
	for field in DATE_FIELDS:
		doc.set(field, data.get(field) or None)
	for field in INT_FIELDS:
		value = data.get(field)
		doc.set(field, cint(value) if value not in (None, "") else 0)
	for field in CHECK_FIELDS:
		doc.set(field, 1 if cint(data.get(field)) else 0)
	for field, target in LINK_FIELDS.items():
		value = (data.get(field) or "").strip()
		if value and not frappe.db.exists(target, value):
			label = _(frappe.get_meta("Student").get_label(field))
			frappe.throw(_("{0} {1} was not found.").format(label, frappe.bold(value)))
		doc.set(field, value or None)


def _payload(doc):
	values = {field: doc.get(field) for field in (*DATA_FIELDS, *DATE_FIELDS, *INT_FIELDS, *CHECK_FIELDS, *LINK_FIELDS)}
	values.update({field: doc.get(field) for field in READ_FIELDS})
	return values
