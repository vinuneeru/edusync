frappe.ui.form.on("System Settings", {
	refresh(frm) {
		frm.add_custom_button(__("Update Edu"), () => {
			frappe.edu_update.confirm_and_start();
		});
	},
});
