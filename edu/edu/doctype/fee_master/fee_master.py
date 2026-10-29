# Copyright (c) 2026, Vinayak and contributors
# License: MIT. See license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt


class FeeMaster(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from edu.edu.doctype.fee_component.fee_component import FeeComponent

		amended_from: DF.Link | None
		fees: DF.Table[FeeComponent]
		fiscal_year: DF.Link
		grade: DF.Link
		naming_series: DF.Literal["FEE-.YYYY.-"]
		revised_from: DF.Link | None
		total: DF.Currency
	# end: auto-generated types

	def validate(self):
		self.validate_fiscal_year()
		self.validate_fees()
		self.validate_revision()
		self.validate_one_submitted_per_grade_year()

	def validate_fiscal_year(self):
		if frappe.db.get_value("Fiscal Year", self.fiscal_year, "disabled"):
			frappe.throw(_("Fiscal Year {0} is disabled.").format(frappe.bold(self.fiscal_year)))

	def validate_fees(self):
		if not self.fees:
			frappe.throw(_("Add at least one fee."))

		seen = set()
		total = 0
		for row in self.fees:
			if row.item in seen:
				frappe.throw(_("Item {0} is listed more than once.").format(frappe.bold(row.item)))
			seen.add(row.item)

			item = frappe.get_cached_value("Item", row.item, ["is_stock_item", "disabled"], as_dict=True)
			if item.disabled:
				frappe.throw(_("Item {0} is disabled.").format(frappe.bold(row.item)))
			if item.is_stock_item:
				frappe.throw(
					_("{0} is a stock item. Fee lines use service items only.").format(frappe.bold(row.item))
				)
			if flt(row.amount) <= 0:
				frappe.throw(
					_("Amount for item {0} must be greater than zero.").format(frappe.bold(row.item))
				)
			total += flt(row.amount)

		self.total = total

	def validate_revision(self):
		if not self.revised_from:
			return
		if self.revised_from == self.name:
			frappe.throw(_("A Fee Master cannot be revised from itself."))

		previous = frappe.db.get_value(
			"Fee Master",
			self.revised_from,
			["docstatus", "grade", "fiscal_year"],
			as_dict=True,
		)
		if not previous or previous.docstatus != 1:
			frappe.throw(_("Revised From must be a submitted Fee Master."))
		if previous.grade != self.grade:
			frappe.throw(_("Revised From must be for grade {0}.").format(frappe.bold(self.grade)))
		if previous.fiscal_year == self.fiscal_year:
			frappe.throw(
				_("The revised document must use a different fiscal year. {0} is already used by {1}.").format(
					frappe.bold(self.fiscal_year), frappe.bold(self.revised_from)
				)
			)

	def validate_one_submitted_per_grade_year(self):
		existing = frappe.db.get_value(
			"Fee Master",
			{
				"grade": self.grade,
				"fiscal_year": self.fiscal_year,
				"docstatus": 1,
				"name": ["!=", self.name],
			},
			"name",
		)
		if existing:
			frappe.throw(
				_("A submitted Fee Master for {0} already exists in {1}: {2}.").format(
					frappe.bold(self.grade), frappe.bold(self.fiscal_year), frappe.bold(existing)
				)
			)


@frappe.whitelist()
def make_revision(source_name):
	def postprocess(source, target):
		target.revised_from = source.name
		target.fiscal_year = _next_fiscal_year(source.fiscal_year)
		target.total = sum(flt(row.amount) for row in target.fees)

	return get_mapped_doc(
		"Fee Master",
		source_name,
		{
			"Fee Master": {
				"doctype": "Fee Master",
				"field_no_map": ["revised_from", "fiscal_year", "amended_from"],
				"validation": {"docstatus": ["=", 1]},
			},
			"Fee Component": {"doctype": "Fee Component"},
		},
		postprocess=postprocess,
	)


def _next_fiscal_year(fiscal_year):
	year_end = frappe.db.get_value("Fiscal Year", fiscal_year, "year_end_date")
	if not year_end:
		return None
	return frappe.db.get_value(
		"Fiscal Year",
		{"disabled": 0, "year_start_date": [">", year_end]},
		"name",
		order_by="year_start_date asc",
	)
