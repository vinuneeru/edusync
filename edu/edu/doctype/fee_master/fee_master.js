frappe.ui.form.on("Fee Master", {
	refresh(frm) {
		frm.set_query("fiscal_year", () => {
			return { filters: { disabled: 0 } };
		});
		frm.set_query("revised_from", () => {
			const filters = { docstatus: 1 };
			if (frm.doc.grade) {
				filters.grade = frm.doc.grade;
			}
			if (frm.doc.name) {
				filters.name = ["!=", frm.doc.name];
			}
			return { filters };
		});
		frm.set_query("item", "fees", () => {
			return {
				filters: {
					is_stock_item: 0,
					disabled: 0,
				},
			};
		});
		if (frm.doc.docstatus === 1) {
			frm.add_custom_button(__("Revise for Next Year"), () => {
				frappe.model.open_mapped_doc({
					method: "edu.edu.doctype.fee_master.fee_master.make_revision",
					frm,
				});
			});
		}
	},
	fees_remove(frm) {
		update_fee_total(frm);
	},
});

frappe.ui.form.on("Fee Component", {
	amount(frm) {
		update_fee_total(frm);
	},
});

function update_fee_total(frm) {
	const total = (frm.doc.fees || []).reduce((sum, row) => sum + flt(row.amount), 0);
	frm.set_value("total", total);
}
