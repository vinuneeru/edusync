# Copyright (c) 2026, Vinayak and contributors
# License: MIT. See license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class TransportLine(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		area: DF.Data | None
		driver_name: DF.Data | None
		driver_phone: DF.Data | None
		line_number: DF.Int
		passenger_capacity: DF.Int
		supervisor_name: DF.Data | None
		supervisor_phone: DF.Data | None
		vehicle_number: DF.Data | None
		vehicle_type: DF.Literal["", "Van", "Minibus", "Coach"]
	# end: auto-generated types

	def validate(self):
		if self.line_number is not None and self.line_number <= 0:
			frappe.throw(_("Line Number must be greater than zero."))
		if self.passenger_capacity is not None and self.passenger_capacity < 0:
			frappe.throw(_("Passenger Capacity cannot be negative."))
