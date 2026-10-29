frappe.ui.form.on("Edu Settings", {
	refresh(frm) {
		frm.disable_save();
		frm.set_df_property("help", "options", `<p class="text-muted">${frappe.utils.escape_html(
			__(
				"This pulls the latest edu app, then runs bench clear-cache, bench clear-website-cache, bench setup requirements, bench build, bench migrate and bench restart. The desk goes offline while the bench restarts."
			)
		)}</p>`);
		frm.page.set_primary_action(__("Pull latest update"), () => {
			frappe.edu_update.confirm_and_start();
		});
	},
});
