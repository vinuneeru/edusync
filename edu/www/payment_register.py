# Copyright (c) 2026, Vinayak and contributors
# License: MIT. See license.txt

from urllib.parse import quote

import frappe
from erpnext.setup.utils import get_exchange_rate
from frappe import _
from frappe.utils import flt, getdate, nowdate

no_cache = 1

CURRENCIES = ("USD", "SYP")


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=" + quote("/payment-register")
		raise frappe.Redirect

	if not frappe.has_permission("Payment Entry", "read") or not frappe.has_permission("Student", "read"):
		frappe.throw(_("You do not have permission to open the payment register."), frappe.PermissionError)

	context.no_cache = 1
	context.safe_render = False
	context.title = _("Payment Register")
	context.company = _company()
	context.full_name = frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user
	context.boot_json = frappe.as_json(context.boot)


@frappe.whitelist()
def get_form_defaults():
	frappe.has_permission("Payment Entry", "read", throw=True)
	company = _company()
	banks = {}
	for currency in CURRENCIES:
		account, bank_account = _receive_bank(company, currency)
		banks[currency] = {"account": account, "bank_account": bank_account}
	return {"today": nowdate(), "company": company, "banks": banks}


@frappe.whitelist()
def search_payments(query=None, currency=None, status=None):
	frappe.has_permission("Payment Entry", "read", throw=True)
	text = (query or "").strip()
	conditions = ["pe.payment_type = 'Receive'", "pe.party_type = 'Customer'", "pe.docstatus != 2"]
	values = {}
	currency = (currency or "").strip().upper()
	if currency in CURRENCIES:
		conditions.append("pe.paid_to_account_currency = %(currency)s")
		values["currency"] = currency
	if status == "Draft":
		conditions.append("pe.docstatus = 0")
	elif status == "Submitted":
		conditions.append("pe.docstatus = 1")
	if text:
		conditions.append(
			"""(
				pe.name like %(q)s
				or pe.party like %(q)s
				or pe.reference_no like %(q)s
				or pe.sender_name like %(q)s
				or s.student_id like %(q)s
				or s.student_name like %(q)s
				or s.last_name like %(q)s
				or concat_ws(' ', ifnull(s.student_name, ''), ifnull(s.last_name, '')) like %(q)s
			)"""
		)
		values["q"] = f"%{text}%"
	rows = frappe.db.sql(
		f"""
		select pe.name, pe.posting_date, pe.party, pe.received_amount as amount,
			pe.paid_to_account_currency as currency, pe.reference_no, pe.docstatus,
			pe.sender_name, s.student_id, s.student_name, s.last_name
		from `tabPayment Entry` pe
		left join `tabCustomer` c on c.name = pe.party
		left join `tabStudent` s on s.name = c.student
		where {" and ".join(conditions)}
		order by pe.posting_date desc, pe.modified desc
		limit 50
		""",
		values,
		as_dict=True,
	)
	for row in rows:
		row["posting_date"] = str(row.posting_date)
		row["display_name"] = _person_name(row.student_name, row.last_name) or row.party
	return rows


@frappe.whitelist()
def lookup_students(query=None):
	frappe.has_permission("Student", "read", throw=True)
	text = (query or "").strip()
	if not text:
		return []
	rows = frappe.db.sql(
		"""
		select s.name, s.student_id, s.student_name, s.last_name, s.customer,
			si.name as sales_invoice, si.outstanding_amount, si.currency as invoice_currency
		from `tabStudent` s
		left join `tabSales Invoice` si
			on si.name = s.sales_invoice and si.docstatus = 1 and si.customer = s.customer
		where s.docstatus = 1
			and ifnull(s.customer, '') != ''
			and (
				s.student_id like %(q)s
				or s.student_name like %(q)s
				or s.last_name like %(q)s
				or s.name like %(q)s
				or concat_ws(' ', ifnull(s.student_name, ''), ifnull(s.last_name, '')) like %(q)s
			)
		order by s.modified desc
		limit 20
		""",
		{"q": f"%{text}%"},
		as_dict=True,
	)
	for row in rows:
		row["display_name"] = _person_name(row.student_name, row.last_name)
	return rows


@frappe.whitelist()
def get_payment(name):
	if not name or not frappe.db.exists("Payment Entry", name):
		frappe.throw(_("Payment Entry {0} was not found.").format(name))
	doc = frappe.get_doc("Payment Entry", name)
	doc.check_permission("read")
	return _payload(doc)


@frappe.whitelist()
def save_payment(data):
	data = _as_dict(data)
	name = (data.get("name") or "").strip()
	if name and frappe.db.exists("Payment Entry", name):
		pe = frappe.get_doc("Payment Entry", name)
		pe.check_permission("write")
		if pe.docstatus != 0:
			frappe.throw(_("Submitted payments are changed from the Payment Entry document."))
		pe.set("references", [])
	else:
		frappe.has_permission("Payment Entry", "create", throw=True)
		pe = frappe.new_doc("Payment Entry")
		pe.naming_series = "ACC-PAY-.YYYY.-"

	student = _submitted_student(data.get("student_id"))
	posting_date = getdate(data.get("posting_date"))
	currency = (data.get("currency") or "").strip().upper()
	if currency not in CURRENCIES:
		frappe.throw(_("Currency must be USD or SYP."))
	amount = flt(data.get("amount"))
	if amount <= 0:
		frappe.throw(_("Amount must be greater than zero."))
	reference_no = (data.get("reference_no") or "").strip()
	if not reference_no:
		frappe.throw(_("Enter the payment notice number."))

	company = _company()
	company_currency = frappe.get_cached_value("Company", company, "default_currency")
	receivable = frappe.get_cached_value("Company", company, "default_receivable_account")
	if not receivable:
		frappe.throw(_("Set the company default receivable account."))
	receivable_currency = frappe.db.get_value("Account", receivable, "account_currency")
	if receivable_currency != company_currency:
		frappe.throw(_("The company receivable account must be in {0}.").format(company_currency))
	paid_to, bank_account = _receive_bank(company, currency)

	pe.payment_type = "Receive"
	pe.company = company
	pe.posting_date = posting_date
	pe.party_type = "Customer"
	pe.party = student.customer
	pe.paid_from = receivable
	pe.paid_from_account_currency = receivable_currency
	pe.paid_to = paid_to
	pe.paid_to_account_currency = currency
	pe.bank_account = bank_account
	pe.reference_no = reference_no
	pe.reference_date = posting_date
	pe.cost_center = frappe.get_cached_value("Company", company, "cost_center")
	pe.sender_name = (data.get("sender_name") or "").strip()
	pe.accountant = (data.get("accountant") or "").strip()
	note = (data.get("remarks") or "").strip()
	pe.remarks = note
	pe.custom_remarks = 1 if note else 0

	if bank_account:
		pe.set_bank_account_data()
	else:
		pe.bank = None
		pe.bank_account_no = None

	pe.setup_party_account_field()
	if currency == company_currency:
		pe.source_exchange_rate = 1
		pe.target_exchange_rate = 1
		pe.paid_amount = amount
		pe.received_amount = amount
	else:
		rate = get_exchange_rate(currency, company_currency, posting_date)
		if not rate:
			frappe.throw(
				_("No exchange rate from {0} to {1} for {2}.").format(currency, company_currency, posting_date)
			)
		pe.source_exchange_rate = 1
		pe.target_exchange_rate = rate
		pe.received_amount = amount
		pe.paid_amount = flt(amount * flt(rate), pe.precision("paid_amount"))

	invoice = _open_invoice(student)
	if invoice and flt(invoice.outstanding_amount) > 0:
		allocated = min(flt(pe.paid_amount), flt(invoice.outstanding_amount))
		pe.append(
			"references",
			{
				"reference_doctype": "Sales Invoice",
				"reference_name": invoice.name,
				"allocated_amount": allocated,
			},
		)

	pe.set_missing_values()
	pe.set_exchange_rate()
	if currency == company_currency:
		pe.paid_amount = amount
		pe.received_amount = amount
	else:
		pe.received_amount = amount
		pe.paid_amount = flt(amount * flt(pe.target_exchange_rate), pe.precision("paid_amount"))
	pe.set_amounts()
	if flt(pe.difference_amount):
		frappe.throw(_("The receipt could not be balanced. Difference is {0}.").format(pe.difference_amount))

	pe.save()
	if flt(pe.difference_amount):
		frappe.throw(_("The receipt could not be balanced. Difference is {0}.").format(pe.difference_amount))
	pe.check_permission("submit")
	pe.submit()
	pe.reload()
	return _payload(pe)


def _company():
	company = frappe.defaults.get_global_default("company")
	if not company:
		frappe.throw(_("Set the default company first."))
	return company


def _receive_bank(company, currency):
	"""Bank ledger for a receipt. SYP uses 5211, not the company default bank."""
	if currency == "USD":
		for row in frappe.get_all(
			"Bank Account",
			filters={"company": company, "is_company_account": 1, "disabled": 0},
			fields=["name", "account"],
		):
			if frappe.db.get_value("Account", row.account, "account_currency") == "USD":
				return row.account, row.name
		frappe.throw(_("No USD bank account is set for {0}.").format(company))

	account = frappe.db.get_value(
		"Account",
		{"company": company, "account_number": "5211", "is_group": 0, "account_type": "Bank"},
		"name",
	)
	if not account:
		frappe.throw(_("No SYP bank account is set for {0}.").format(company))
	return account, None


def _submitted_student(student_id):
	student_id = (student_id or "").strip()
	if not student_id:
		frappe.throw(_("Enter the student ID."))
	names = frappe.get_all(
		"Student",
		filters={"student_id": student_id, "docstatus": ["!=", 2]},
		pluck="name",
	)
	if not names and frappe.db.exists("Student", student_id):
		names = [student_id]
	if not names:
		names = [
			row.name
			for row in frappe.db.sql(
				"""
				select name
				from `tabStudent`
				where docstatus = 1
					and ifnull(customer, '') != ''
					and (
						student_id like %(like)s
						or student_name = %(q)s
						or last_name = %(q)s
						or concat_ws(' ', ifnull(student_name, ''), ifnull(last_name, '')) = %(q)s
						or student_name like %(like)s
						or last_name like %(like)s
						or concat_ws(' ', ifnull(student_name, ''), ifnull(last_name, '')) like %(like)s
					)
				""",
				{"q": student_id, "like": f"%{student_id}%"},
				as_dict=True,
			)
		]
	if not names:
		frappe.throw(_("Student {0} was not found.").format(student_id))
	if len(names) > 1:
		frappe.throw(_("More than one student matches {0}. Choose the student from the list.").format(student_id))
	doc = frappe.get_doc("Student", names[0])
	doc.check_permission("read")
	if doc.docstatus != 1:
		frappe.throw(_("Submit the student before recording a payment."))
	if not doc.customer or not frappe.db.exists("Customer", doc.customer):
		frappe.throw(_("This student has no customer yet."))
	return doc


def _open_invoice(student):
	if not student.sales_invoice:
		return None
	invoice = frappe.db.get_value(
		"Sales Invoice",
		student.sales_invoice,
		["name", "docstatus", "customer", "outstanding_amount", "currency", "debit_to"],
		as_dict=True,
	)
	if not invoice or invoice.docstatus != 1 or invoice.customer != student.customer:
		return None
	return invoice


def _payload(pe):
	student = _student_from_party(pe.party)
	invoice_name = None
	allocated = 0
	for row in pe.get("references"):
		if row.reference_doctype == "Sales Invoice" and flt(row.allocated_amount):
			invoice_name = row.reference_name
			allocated = row.allocated_amount
			break
	if not invoice_name and student and student.sales_invoice:
		open_invoice = _open_invoice(student)
		invoice_name = open_invoice.name if open_invoice else None
	outstanding = None
	invoice_currency = None
	if invoice_name:
		outstanding, invoice_currency = frappe.db.get_value(
			"Sales Invoice", invoice_name, ["outstanding_amount", "currency"]
		)
	currency = pe.paid_to_account_currency
	amount = pe.received_amount if currency != pe.paid_from_account_currency else pe.paid_amount
	return {
		"name": pe.name,
		"docstatus": pe.docstatus,
		"student_id": student.student_id if student else "",
		"student_name": _person_name(student.student_name, student.last_name) if student else (pe.party_name or pe.party),
		"posting_date": str(getdate(pe.posting_date)),
		"amount": amount,
		"currency": currency,
		"reference_no": pe.reference_no or "",
		"sender_name": pe.sender_name or "",
		"accountant": pe.accountant or "",
		"remarks": (pe.remarks or "") if pe.custom_remarks else "",
		"sales_invoice": invoice_name or "",
		"outstanding_amount": outstanding,
		"invoice_currency": invoice_currency,
		"allocated_amount": allocated,
		"unallocated_amount": pe.unallocated_amount,
		"paid_to": pe.paid_to,
		"party": pe.party,
		"attachments": _attachments(pe.name),
	}


def _attachments(name):
	if not name:
		return []
	return frappe.get_all(
		"File",
		filters={"attached_to_doctype": "Payment Entry", "attached_to_name": name},
		fields=["name", "file_name", "file_url"],
		order_by="creation asc",
		limit=20,
	)


def _student_from_party(party):
	student_name = frappe.db.get_value("Customer", party, "student")
	if not student_name or not frappe.db.exists("Student", student_name):
		return None
	return frappe.db.get_value(
		"Student",
		student_name,
		["name", "student_id", "student_name", "last_name", "customer", "sales_invoice", "docstatus"],
		as_dict=True,
	)


def _person_name(student_name, last_name):
	return " ".join(part for part in (student_name, last_name) if part)


def _as_dict(data):
	if isinstance(data, str):
		data = frappe.parse_json(data)
	return frappe._dict(data or {})
