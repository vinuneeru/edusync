frappe.provide("frappe.edu_update");

frappe.edu_update.confirm_and_start = function () {
	frappe.call({
		method: "edu.edu.edu_update.edu_update_status",
		callback(response) {
			if (response.message && response.message.running) {
				frappe.edu_update.show_log();
				return;
			}
			frappe.confirm(
				__(
					"This pulls the latest edu app, then runs bench clear-cache, bench clear-website-cache, bench setup requirements, bench build, bench migrate and bench restart. The desk goes offline while the bench restarts."
				),
				() => frappe.edu_update.start()
			);
		},
	});
};

frappe.edu_update.start = function () {
	frappe.call({
		method: "edu.edu.edu_update.start_edu_update",
		freeze: true,
		freeze_message: __("Starting the update"),
		callback(response) {
			if (response.message) {
				frappe.edu_update.show_log();
			}
		},
	});
};

frappe.edu_update.show_log = function () {
	const dialog = new frappe.ui.Dialog({
		title: __("Update Edu"),
		size: "large",
		fields: [{ fieldname: "log", fieldtype: "HTML" }],
	});
	dialog.show();
	const log = $(`<pre class="edu-update-log"></pre>`);
	log.css({
		maxHeight: "60vh",
		overflow: "auto",
		whiteSpace: "pre-wrap",
		margin: 0,
		fontSize: "12px",
	});
	dialog.fields_dict.log.$wrapper.empty().append(log);

	let saw_running = false;
	let stopped = false;
	const tick = () => {
		if (stopped || !dialog.display) {
			return;
		}
		frappe.call({
			method: "edu.edu.edu_update.edu_update_status",
			callback(response) {
				const message = response.message || {};
				log.text(message.log || "");
				log.scrollTop(log.prop("scrollHeight"));
				if (message.running) {
					saw_running = true;
					setTimeout(tick, 2000);
					return;
				}
				if (!saw_running) {
					return;
				}
				if (message.exit_code === 0) {
					frappe.show_alert({ message: __("Update finished"), indicator: "green" });
				} else {
					frappe.show_alert({ message: __("Update failed"), indicator: "red" });
				}
			},
			error() {
				if (!stopped) {
					stopped = true;
					log.append(
						`\n${__("The desk stopped answering. Reload this page in a moment.")}`
					);
				}
			},
		});
	};
	tick();
};
