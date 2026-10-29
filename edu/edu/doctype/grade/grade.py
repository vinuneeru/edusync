# Copyright (c) 2026, Vinayak and contributors
# License: MIT. See license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class Grade(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from edu.edu.doctype.grade_subject.grade_subject import GradeSubject

		description: DF.SmallText | None
		grade_name: DF.Data
		subjects: DF.Table[GradeSubject]
	# end: auto-generated types

	def validate(self):
		self.validate_subjects()

	def validate_subjects(self):
		seen = set()
		for row in self.subjects:
			name = (row.subject or "").strip()
			row.subject = name
			key = name.casefold()
			if not key:
				continue
			if key in seen:
				frappe.throw(_("Subject {0} is listed more than once.").format(frappe.bold(name)))
			seen.add(key)
