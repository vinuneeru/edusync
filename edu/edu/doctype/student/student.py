# Copyright (c) 2026, Vinayak and contributors
# License: MIT. See license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate


class Student(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		address_line_1: DF.Data | None
		address_line_2: DF.Data | None
		amended_from: DF.Link | None
		civil_registry_office: DF.Data | None
		class_division: DF.Data | None
		customer: DF.Link | None
		date_of_birth: DF.Date | None
		district: DF.Data | None
		education_ministry_id: DF.Data | None
		family_sequence: DF.Int
		father_name: DF.Data | None
		father_phone: DF.Data | None
		fees_paid: DF.Check
		student_name: DF.Data
		gender: DF.Literal["Male", "Female"]
		general_register_no: DF.Data | None
		governorate: DF.Data | None
		grade: DF.Link | None
		grandfather_name: DF.Data | None
		has_documents: DF.Check
		has_dossier: DF.Check
		has_ninth_certificate: DF.Check
		is_martyrs_child: DF.Check
		is_orphan: DF.Check
		last_name: DF.Data
		mother_name: DF.Data | None
		mother_phone: DF.Data | None
		national_id: DF.Data | None
		nationality: DF.Data | None
		needs_meal: DF.Check
		needs_transport: DF.Check
		notes: DF.SmallText | None
		place_of_birth: DF.Data | None
		place_of_registration: DF.Data | None
		previous_school: DF.Data | None
		registration_date: DF.Date | None
		registration_number: DF.Data | None
		sales_invoice: DF.Link | None
		school_section: DF.Data | None
		siblings_in_school: DF.Int
		status: DF.Literal["New", "Returning"]
		street: DF.Data | None
		student_id: DF.Data
		subdistrict: DF.Data | None
		transport_line: DF.Link | None
		withdrawal_date: DF.Date | None
		withdrawal_reason: DF.SmallText | None
	# end: auto-generated types

	def autoname(self):
		self.name = self.student_id
		if self.amended_from and frappe.db.exists("Student", self.name):
			serial = frappe.db.count("Student", {"student_id": self.student_id})
			self.name = f"{self.student_id}-{serial}"

	def validate(self):
		self.validate_student_id()

	def validate_student_id(self):
		existing = frappe.db.get_value(
			"Student",
			{"student_id": self.student_id, "docstatus": ["!=", 2], "name": ["!=", self.name]},
			"name",
		)
		if existing:
			frappe.throw(
				_("Student ID {0} is already used by {1}.").format(
					frappe.bold(self.student_id), frappe.bold(existing)
				)
			)

	def on_submit(self):
		if not self.grade:
			return

		posting_date = getdate(self.registration_date) if self.registration_date else getdate()
		fee_master = get_fee_master(self.grade, posting_date)
		invoice = create_fee_invoice(self, fee_master, posting_date)
		self.db_set({"customer": invoice.customer, "sales_invoice": invoice.name})

	def on_cancel(self):
		if not self.sales_invoice:
			return

		invoice = frappe.get_doc("Sales Invoice", self.sales_invoice)
		if invoice.docstatus != 1:
			return
		if flt(invoice.outstanding_amount) < flt(invoice.grand_total):
			frappe.throw(
				_("Cancel the payments against Sales Invoice {0} before cancelling this student.").format(
					frappe.bold(invoice.name)
				)
			)
		invoice.flags.ignore_links = True
		invoice.cancel()


def get_fee_master(grade, posting_date):
	rows = frappe.db.sql(
		"""
		select fm.name
		from `tabFee Master` fm
		inner join `tabFiscal Year` fy on fy.name = fm.fiscal_year
		where fm.grade = %s
			and fm.docstatus = 1
			and ifnull(fy.disabled, 0) = 0
			and fy.year_start_date <= %s
			and fy.year_end_date >= %s
		""",
		(grade, posting_date, posting_date),
		pluck=True,
	)
	if not rows:
		frappe.throw(
			_(
				"No submitted Fee Master for grade {0} covers {1}. Submit a Fee Master for that year before enrolling the student."
			).format(frappe.bold(grade), frappe.bold(format_date(posting_date)))
		)
	if len(rows) > 1:
		frappe.throw(
			_("More than one submitted Fee Master for grade {0} covers {1}: {2}.").format(
				frappe.bold(grade),
				frappe.bold(format_date(posting_date)),
				frappe.bold(", ".join(rows)),
			)
		)
	return frappe.get_doc("Fee Master", rows[0])


def format_date(posting_date):
	return frappe.format(posting_date, {"fieldtype": "Date"})


def create_fee_invoice(student, fee_master, posting_date):
	company = get_company()
	income_account = get_income_account(company)
	cost_center = frappe.get_cached_value("Company", company, "cost_center")
	customer = get_or_create_customer(student)

	invoice = frappe.new_doc("Sales Invoice")
	invoice.customer = customer
	invoice.company = company
	invoice.posting_date = posting_date
	invoice.due_date = posting_date
	invoice.student = student.name
	invoice.update_stock = 0
	invoice.ignore_pricing_rule = 1
	invoice.set_posting_time = 1
	invoice.remarks = _("Fees for {0}, {1}.").format(fee_master.grade, fee_master.fiscal_year)

	rates = {}
	for row in fee_master.fees:
		rates[row.item] = flt(row.amount)
		invoice.append(
			"items",
			{
				"item_code": row.item,
				"qty": 1,
				"rate": row.amount,
				"income_account": income_account,
				"cost_center": cost_center,
			},
		)

	invoice.set_missing_values()
	invoice.posting_date = posting_date
	invoice.due_date = posting_date
	for item in invoice.items:
		item.qty = 1
		item.rate = rates.get(item.item_code, item.rate)
		item.price_list_rate = item.rate
		item.income_account = item.income_account or income_account
		item.cost_center = item.cost_center or cost_center
	invoice.calculate_taxes_and_totals()
	invoice.flags.ignore_permissions = True
	invoice.insert(ignore_permissions=True)
	invoice.submit()
	return invoice


def get_company():
	company = frappe.defaults.get_global_default("company")
	if company:
		return company
	companies = frappe.get_all("Company", pluck="name", limit=2)
	if len(companies) == 1:
		return companies[0]
	frappe.throw(_("Set a default Company before enrolling a student."))


def get_income_account(company):
	account = frappe.get_cached_value("Company", company, "default_income_account")
	if account:
		return account
	frappe.throw(
		_("Set the Default Income Account on Company {0} before enrolling a student.").format(
			frappe.bold(company)
		)
	)


def get_or_create_customer(student):
	full_name = " ".join(part for part in (student.student_name, student.last_name) if part)
	existing = frappe.db.get_value("Customer", {"student_id": student.student_id}, "name")
	if existing:
		frappe.db.set_value(
			"Customer",
			existing,
			{"student": student.name, "customer_name": full_name, "customer_group": customer_group()},
			update_modified=False,
		)
		return existing

	customer = frappe.get_doc(
		{
			"doctype": "Customer",
			"naming_series": "CUST-.YYYY.-",
			"customer_name": full_name,
			"customer_type": "Individual",
			"customer_group": customer_group(),
			"territory": customer_territory(),
			"student": student.name,
			"student_id": student.student_id,
		}
	)
	customer.flags.ignore_permissions = True
	customer.insert(ignore_permissions=True)
	return customer.name


def customer_group():
	name = "Student"
	if frappe.db.exists("Customer Group", name):
		return name
	if not frappe.db.exists("Customer Group", "All Customer Groups"):
		frappe.throw(_("Customer Group {0} is missing.").format(frappe.bold("All Customer Groups")))
	doc = frappe.get_doc(
		{
			"doctype": "Customer Group",
			"customer_group_name": name,
			"parent_customer_group": "All Customer Groups",
			"is_group": 0,
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert(ignore_permissions=True)
	return name


def customer_territory():
	territory = frappe.db.get_single_value("Selling Settings", "territory")
	if territory and not frappe.db.get_value("Territory", territory, "is_group"):
		return territory
	country = frappe.get_cached_value("Company", get_company(), "country")
	if country and frappe.db.exists("Territory", country) and not frappe.db.get_value(
		"Territory", country, "is_group"
	):
		return country
	if frappe.db.exists("Territory", "Rest Of The World") and not frappe.db.get_value(
		"Territory", "Rest Of The World", "is_group"
	):
		return "Rest Of The World"
	frappe.throw(_("Set a Territory in Selling Settings before enrolling a student."))
