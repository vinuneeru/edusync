frappe.provide("edu");

frappe.pages["student-desk"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Student Register"),
		single_column: true,
	});
	wrapper.student_register = new edu.StudentRegister(page, wrapper);
};

frappe.pages["student-desk"].on_page_show = function (wrapper) {
	wrapper.student_register?.refresh_list();
};

edu.StudentRegister = class StudentRegister {
	constructor(page) {
		this.page = page;
		this.page.main.addClass("student-register");
		this.query = "";
		this.selected = null;
		this.student = null;
		this.records = [];
		this.options = { grades: [], transport_lines: [] };
		this.read_only = false;
		this.saving = false;
		this.request_id = 0;
		this.make();
		this.load_options().then(() => this.new_student());
		this.refresh_list();
	}

	make() {
		this.page.main.html(`
			<label class="sr-search">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"></circle>
					<path d="M20 20L16.5 16.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
				</svg>
				<input type="search" class="sr-query" placeholder="${__("Search by name or student ID")}" autocomplete="off" spellcheck="false">
			</label>
			<div class="sr-body">
				<aside class="sr-list-card">
					<div class="sr-list-label">${__("Recent")}</div>
					<div class="sr-list"></div>
				</aside>
				<section class="sr-form">
					<div class="sr-form-head">
						<div>
							<p class="sr-kicker">${__("Student Register")}</p>
							<h2 class="sr-title"></h2>
						</div>
						<div class="sr-actions">
							<button type="button" class="sr-btn sr-new">${__("New student")}</button>
							<button type="button" class="sr-btn sr-btn-primary sr-save">${__("Save")}</button>
						</div>
					</div>
					<p class="sr-help"></p>
					<div class="sr-banner" hidden></div>
					<div class="sr-sections"></div>
					<div class="sr-form-footer">
						<button type="button" class="sr-btn sr-open" hidden>${__("Open Student")}</button>
						<button type="button" class="sr-btn sr-btn-primary sr-save">${__("Save")}</button>
					</div>
				</section>
			</div>
		`);
		this.$query = this.page.main.find(".sr-query");
		this.$list_label = this.page.main.find(".sr-list-label");
		this.$list = this.page.main.find(".sr-list");
		this.$title = this.page.main.find(".sr-title");
		this.$help = this.page.main.find(".sr-help");
		this.$banner = this.page.main.find(".sr-banner");
		this.$sections = this.page.main.find(".sr-sections");
		this.$query.on("input", () => {
			this.query = this.$query.val();
			clearTimeout(this.search_timer);
			this.search_timer = setTimeout(() => this.refresh_list(), 200);
		});
		this.$query.on("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				const first = this.records[0];
				if (first) {
					this.open_student(first.name);
				}
			}
		});
		this.page.main.on("click", ".sr-new", () => this.new_student());
		this.page.main.on("click", ".sr-save", () => this.save());
		this.page.main.on("click", ".sr-open", () => {
			if (this.selected) {
				frappe.set_route("Form", "Student", this.selected);
			}
		});
		this.page.main.on("click", ".sr-result", (event) => {
			this.open_student($(event.currentTarget).attr("data-name"));
		});
		this.render_sections();
	}

	sections() {
		return [
			{
				title: __("Student"),
				fields: [
					{ fieldname: "student_id", label: __("Student ID"), required: true },
					{ fieldname: "status", label: __("Status"), type: "select", options: ["New", "Returning"], required: true },
					{ fieldname: "gender", label: __("Gender"), type: "select", options: ["Male", "Female"], required: true },
					{ fieldname: "student_name", label: __("Student Name"), required: true },
					{ fieldname: "last_name", label: __("Last Name"), required: true },
				],
			},
			{
				title: __("Family"),
				fields: [
					{ fieldname: "father_name", label: __("Father's Name") },
					{ fieldname: "mother_name", label: __("Mother's Name") },
					{ fieldname: "grandfather_name", label: __("Grandfather's Name") },
					{ fieldname: "family_sequence", label: __("Family Sequence"), type: "int" },
					{ fieldname: "father_phone", label: __("Father's Phone") },
					{ fieldname: "mother_phone", label: __("Mother's Phone") },
				],
			},
			{
				title: __("Civil Registry"),
				fields: [
					{ fieldname: "date_of_birth", label: __("Date of Birth"), type: "date" },
					{ fieldname: "place_of_birth", label: __("Place of Birth") },
					{ fieldname: "nationality", label: __("Nationality") },
					{ fieldname: "national_id", label: __("National ID") },
					{ fieldname: "civil_registry_office", label: __("Civil Registry Office") },
					{ fieldname: "place_of_registration", label: __("Place of Registration") },
					{ fieldname: "registration_number", label: __("Registration Number") },
				],
			},
			{
				title: __("School"),
				fields: [
					{ fieldname: "grade", label: __("Grade"), type: "grade" },
					{ fieldname: "school_section", label: __("Section") },
					{ fieldname: "class_division", label: __("Division") },
					{ fieldname: "education_ministry_id", label: __("Education Ministry ID") },
					{ fieldname: "general_register_no", label: __("General Register No") },
					{ fieldname: "previous_school", label: __("Previous School") },
				],
			},
			{
				title: __("Address"),
				fields: [
					{ fieldname: "governorate", label: __("Governorate") },
					{ fieldname: "district", label: __("District") },
					{ fieldname: "subdistrict", label: __("Subdistrict") },
					{ fieldname: "street", label: __("Street") },
					{ fieldname: "address_line_1", label: __("Address Line 1"), wide: true },
					{ fieldname: "address_line_2", label: __("Address Line 2"), wide: true },
				],
			},
			{
				title: __("Enrollment"),
				fields: [
					{ fieldname: "registration_date", label: __("Registration Date"), type: "date" },
					{ fieldname: "siblings_in_school", label: __("Siblings in School"), type: "int" },
					{ fieldname: "needs_transport", label: __("Needs Transport"), type: "check" },
					{ fieldname: "needs_meal", label: __("Needs Meal"), type: "check" },
					{ fieldname: "transport_line", label: __("Transport Line"), type: "transport" },
					{ fieldname: "withdrawal_date", label: __("Withdrawal Date"), type: "date" },
					{ fieldname: "withdrawal_reason", label: __("Withdrawal Reason"), type: "text", wide: true },
				],
			},
			{
				title: __("Records"),
				fields: [
					{ fieldname: "has_dossier", label: __("Dossier on File"), type: "check" },
					{ fieldname: "has_documents", label: __("Supporting Documents"), type: "check" },
					{ fieldname: "has_ninth_certificate", label: __("Ninth Grade Certificate"), type: "check" },
					{ fieldname: "is_orphan", label: __("Orphan"), type: "check" },
					{ fieldname: "is_martyrs_child", label: __("Martyr's Child"), type: "check" },
					{ fieldname: "fees_paid", label: __("Fees Paid"), type: "check" },
				],
			},
			{
				title: __("Notes"),
				fields: [{ fieldname: "notes", label: __("General Notes"), type: "text", wide: true }],
			},
		];
	}

	render_sections() {
		const html = this.sections()
			.map((section) => {
				const fields = section.fields
					.map((field) => {
						if (field.type === "check") {
							return "";
						}
						return this.field_html(field);
					})
					.join("");
				const checks = section.fields.filter((field) => field.type === "check");
				const checks_html = checks.length
					? `<div class="sr-checks">${checks
							.map(
								(field) => `
						<label class="sr-check">
							<input type="checkbox" data-field="${field.fieldname}">
							<span>${frappe.utils.escape_html(field.label)}</span>
						</label>`
							)
							.join("")}</div>`
					: "";
				return `
					<section class="sr-section">
						<h3>${frappe.utils.escape_html(section.title)}</h3>
						<div class="sr-grid">${fields}${checks_html}</div>
					</section>`;
			})
			.join("");
		this.$sections.html(html);
	}

	field_html(field) {
		const required = field.required ? `<span class="sr-req">*</span>` : "";
		let control = `<input type="text" data-field="${field.fieldname}" dir="auto" autocomplete="off">`;
		if (field.type === "date") {
			control = `<input type="date" data-field="${field.fieldname}">`;
		} else if (field.type === "int") {
			control = `<input type="number" min="0" step="1" data-field="${field.fieldname}">`;
		} else if (field.type === "text") {
			control = `<textarea data-field="${field.fieldname}" dir="auto"></textarea>`;
		} else if (field.type === "select" || field.type === "grade" || field.type === "transport") {
			control = `<select data-field="${field.fieldname}"></select>`;
		}
		return `
			<div class="sr-field ${field.wide ? "wide" : ""}">
				<label>${frappe.utils.escape_html(field.label)} ${required}</label>
				${control}
			</div>`;
	}

	load_options() {
		return frappe
			.call({
				method: "edu.edu.page.student_desk.student_desk.get_form_options",
			})
			.then((response) => {
				this.options = response.message || this.options;
				this.fill_selects();
			});
	}

	fill_selects() {
		this.fill_fixed_select("status", ["New", "Returning"]);
		this.fill_fixed_select("gender", ["Male", "Female"]);
		const grade = this.page.main.find('[data-field="grade"]');
		grade.html(`<option value=""></option>`);
		for (const row of this.options.grades || []) {
			const label = row.description ? `${row.grade_name} — ${row.description}` : row.grade_name;
			grade.append(`<option value="${frappe.utils.escape_html(row.name)}">${frappe.utils.escape_html(label)}</option>`);
		}
		const line = this.page.main.find('[data-field="transport_line"]');
		line.html(`<option value=""></option>`);
		for (const row of this.options.transport_lines || []) {
			const label = `${row.line_number} · ${row.area || ""}`;
			line.append(`<option value="${frappe.utils.escape_html(row.name)}">${frappe.utils.escape_html(label)}</option>`);
		}
		if (this.student) {
			this.set_values(this.student);
		}
	}

	fill_fixed_select(fieldname, options) {
		const select = this.page.main.find(`[data-field="${fieldname}"]`);
		select.html(`<option value=""></option>`);
		for (const option of options) {
			select.append(`<option value="${frappe.utils.escape_html(option)}">${frappe.utils.escape_html(__(option))}</option>`);
		}
	}

	refresh_list() {
		const request_id = ++this.request_id;
		this.$list_label.text(this.query.trim() ? __("Results") : __("Recent"));
		return frappe
			.call({
				method: "edu.edu.page.student_desk.student_desk.search_students",
				args: { query: this.query },
			})
			.then((response) => {
				if (request_id !== this.request_id) {
					return;
				}
				this.records = response.message || [];
				this.render_list();
			});
	}

	render_list() {
		if (!this.records.length) {
			const message = this.query.trim() ? __("No matching students") : __("No students yet");
			this.$list.html(`<div class="sr-empty">${frappe.utils.escape_html(message)}</div>`);
			return;
		}
		const html = this.records
			.map((row) => {
				const name = [row.student_name, row.last_name].filter(Boolean).join(" ") || row.student_id;
				const bits = [row.student_id];
				if (row.grade) {
					bits.push(`${__("Grade")} ${row.grade}`);
				}
				if (row.transport_line) {
					bits.push(`${__("Line")} ${row.transport_line}`);
				}
				const active = row.name === this.selected ? "is-active" : "";
				const chip = row.docstatus === 1 ? "is-submitted" : "";
				return `
					<button type="button" class="sr-result ${active}" data-name="${frappe.utils.escape_html(row.name)}">
						<div class="sr-result-name" dir="auto">${frappe.utils.escape_html(name)}</div>
						<div class="sr-result-meta">
							<span>${frappe.utils.escape_html(bits.join(" · "))}</span>
							<span class="sr-chip ${chip}">${frappe.utils.escape_html(this.status_label(row.docstatus))}</span>
						</div>
					</button>`;
			})
			.join("");
		this.$list.html(html);
	}

	status_label(docstatus) {
		if (cint(docstatus) === 1) {
			return __("Submitted");
		}
		if (cint(docstatus) === 2) {
			return __("Cancelled");
		}
		return __("Draft");
	}

	new_student() {
		this.selected = null;
		this.student = {};
		this.read_only = false;
		this.$title.text(__("New student"));
		this.$help.text(
			__("Saving submits the student. When a grade is set, the fee invoice is created.")
		);
		this.$banner.attr("hidden", true).empty();
		this.page.main.find(".sr-open").attr("hidden", true);
		this.set_values({});
		this.set_read_only(false);
		this.render_list();
		this.page.main.find('[data-field="student_id"]').trigger("focus");
	}

	open_student(name) {
		frappe
			.call({
				method: "edu.edu.page.student_desk.student_desk.get_student",
				args: { name },
			})
			.then((response) => this.show_student(response.message));
	}

	show_student(student) {
		if (!student) {
			return;
		}
		this.selected = student.name;
		this.student = student;
		this.read_only = cint(student.docstatus) !== 0;
		const title = [student.student_name, student.last_name].filter(Boolean).join(" ") || student.student_id;
		this.$title.text(title);
		this.$help.text(`${student.student_id} · ${this.status_label(student.docstatus)}`);
		this.page.main.find(".sr-open").removeAttr("hidden");
		if (this.read_only) {
			this.$banner.removeAttr("hidden").html(
				`${__("This student is submitted. Open the Student document to change it.")}`
			);
		} else {
			this.$banner.attr("hidden", true).empty();
		}
		this.set_values(student);
		this.set_read_only(this.read_only);
		this.render_list();
	}

	set_values(student) {
		this.page.main.find("[data-field]").each((_, element) => {
			const fieldname = element.dataset.field;
			const value = student[fieldname];
			if (element.type === "checkbox") {
				element.checked = cint(value) === 1;
			} else if (element.type === "number") {
				element.value = value ? value : "";
			} else {
				element.value = value || "";
			}
		});
	}

	set_read_only(read_only) {
		this.page.main.find(".sr-save").prop("disabled", read_only || this.saving);
		this.page.main.find("[data-field]").prop("disabled", read_only);
		if (!read_only && this.selected) {
			this.page.main.find('[data-field="student_id"]').prop("disabled", true);
		}
	}

	values() {
		const data = { name: this.selected };
		this.page.main.find("[data-field]").each((_, element) => {
			const fieldname = element.dataset.field;
			if (element.type === "checkbox") {
				data[fieldname] = element.checked ? 1 : 0;
			} else {
				data[fieldname] = element.value;
			}
		});
		return data;
	}

	save() {
		if (this.read_only || this.saving) {
			return;
		}
		this.saving = true;
		this.page.main.find(".sr-save").prop("disabled", true).text(__("Saving"));
		frappe
			.call({
				method: "edu.edu.page.student_desk.student_desk.save_student",
				args: { data: this.values() },
			})
			.then((response) => {
				this.show_student(response.message);
				frappe.show_alert({ message: __("Saved"), indicator: "green" });
				return this.refresh_list();
			})
			.always(() => {
				this.saving = false;
				this.page.main.find(".sr-save").text(__("Save"));
				this.set_read_only(this.read_only);
			});
	}
};

function cint(value) {
	const number = parseInt(value, 10);
	return Number.isNaN(number) ? 0 : number;
}
