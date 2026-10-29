# Copyright (c) 2026, Vinayak and contributors
# License: MIT. See license.txt

from frappe.model.document import Document


class FeeComponent(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		amount: DF.Currency
		item: DF.Link
	# end: auto-generated types
