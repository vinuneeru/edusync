(() => {
	const root = document.querySelector("#student-register");
	if (!root) {
		return;
	}

	function StudentRegister(root) {
		this.root = root;
		this.query = "";
		this.grade = "";
		this.list_status = "";
		this.selected = null;
		this.student = null;
		this.records = [];
		this.options = { grades: [], transport_lines: [] };
		this.read_only = false;
		this.saving = false;
		this.request_id = 0;
		this.$query = root.querySelector(".sr-query");
		this.$list_label = root.querySelector(".sr-list-label");
		this.$list = root.querySelector(".sr-list");
		this.$title = root.querySelector(".sr-title");
		this.$help = root.querySelector(".sr-help");
		this.$banner = root.querySelector(".sr-banner");
		this.$status = root.querySelector(".sr-status");
		this.$sections = root.querySelector(".sr-sections");
		this.$open = root.querySelector(".sr-open");
	}

	StudentRegister.prototype.start = function () {
		this.render_sections();
		this.$query.addEventListener("input", () => {
			this.query = this.$query.value;
			clearTimeout(this.search_timer);
			this.search_timer = setTimeout(() => this.refresh_list(), 200);
		});
		this.$query.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				if (this.records[0]) {
					this.open_student(this.records[0].name);
				}
			}
		});
		this.root.addEventListener("click", (event) => {
			const result = event.target.closest(".sr-result");
			if (result) {
				this.open_student(result.dataset.name);
				return;
			}
			if (event.target.closest(".sr-new")) {
				this.new_student();
			}
			if (event.target.closest(".sr-save")) {
				this.save();
			}
		});
		const grade_filter = this.root.querySelector(".sr-grade-filter");
		const status_filter = this.root.querySelector(".sr-status-filter");
		grade_filter.addEventListener("change", () => {
			this.grade = grade_filter.value;
			this.refresh_list();
		});
		status_filter.addEventListener("change", () => {
			this.list_status = status_filter.value;
			this.refresh_list();
		});
		this.load_options().then(() => this.new_student());
		this.refresh_list();
	};

	StudentRegister.prototype.sections = function () {
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
	};

	StudentRegister.prototype.render_sections = function () {
		this.$sections.innerHTML = this.sections()
			.map((section) => {
				const fields = section.fields
					.filter((field) => field.type !== "check")
					.map((field) => this.field_html(field))
					.join("");
				const checks = section.fields.filter((field) => field.type === "check");
				const checks_html = checks.length
					? `<div class="sr-checks">${checks
							.map(
								(field) => `
							<label class="sr-check">
								<input type="checkbox" data-field="${field.fieldname}">
								<span>${esc(field.label)}</span>
							</label>`
							)
							.join("")}</div>`
					: "";
				return `
					<section class="sr-section">
						<h3>${esc(section.title)}</h3>
						<div class="sr-grid">${fields}${checks_html}</div>
					</section>`;
			})
			.join("");
	};

	StudentRegister.prototype.field_html = function (field) {
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
				<label>${esc(field.label)} ${required}</label>
				${control}
			</div>`;
	};

	StudentRegister.prototype.load_options = function () {
		return call("edu.edu.page.student_desk.student_desk.get_form_options").then((options) => {
			this.options = options || this.options;
			this.fill_selects();
		});
	};

	StudentRegister.prototype.fill_selects = function () {
		this.fill_fixed_select("status", ["New", "Returning"]);
		this.fill_fixed_select("gender", ["Male", "Female"]);
		const grade = this.root.querySelector('[data-field="grade"]');
		grade.innerHTML = `<option value=""></option>`;
		for (const row of this.options.grades || []) {
			const label = row.description ? `${row.grade_name} — ${row.description}` : row.grade_name;
			grade.insertAdjacentHTML(
				"beforeend",
				`<option value="${esc(row.name)}">${esc(label)}</option>`
			);
		}
		const line = this.root.querySelector('[data-field="transport_line"]');
		line.innerHTML = `<option value=""></option>`;
		for (const row of this.options.transport_lines || []) {
			line.insertAdjacentHTML(
				"beforeend",
				`<option value="${esc(row.name)}">${esc(`${row.line_number} · ${row.area || ""}`)}</option>`
			);
		}
		if (this.student) {
			this.set_values(this.student);
		}
		this.fill_grade_filter();
	};

	StudentRegister.prototype.fill_grade_filter = function () {
		const select = this.root.querySelector(".sr-grade-filter");
		const current = this.grade;
		select.innerHTML = `<option value="">${esc(__("All grades"))}</option>`;
		for (const row of this.options.grades || []) {
			const label = row.description ? `${row.grade_name} — ${row.description}` : row.grade_name;
			select.insertAdjacentHTML(
				"beforeend",
				`<option value="${esc(row.name)}">${esc(label)}</option>`
			);
		}
		select.value = current;
	};

	StudentRegister.prototype.fill_fixed_select = function (fieldname, options) {
		const select = this.root.querySelector(`[data-field="${fieldname}"]`);
		select.innerHTML = `<option value=""></option>`;
		for (const option of options) {
			select.insertAdjacentHTML(
				"beforeend",
				`<option value="${esc(option)}">${esc(__(option))}</option>`
			);
		}
	};

	StudentRegister.prototype.refresh_list = function () {
		const request_id = ++this.request_id;
		const filtering = Boolean(this.query.trim() || this.grade || this.list_status);
		this.$list_label.textContent = filtering ? __("Results") : __("Recent");
		return call("edu.edu.page.student_desk.student_desk.search_students", {
			query: this.query,
			grade: this.grade,
			status: this.list_status,
		})
			.then((rows) => {
				if (request_id !== this.request_id) {
					return;
				}
				this.records = rows || [];
				this.render_list();
			})
			.catch((error) => {
				if (request_id !== this.request_id) {
					return;
				}
				this.records = [];
				this.$list.innerHTML = `<div class="sr-empty">${esc(error_message(error))}</div>`;
			});
	};

	StudentRegister.prototype.render_list = function () {
		if (!this.records.length) {
			const message = this.query.trim() ? __("No matching students") : __("No students yet");
			this.$list.innerHTML = `<div class="sr-empty">${esc(message)}</div>`;
			return;
		}
		this.$list.innerHTML = this.records
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
				const chip = cint(row.docstatus) === 1 ? "is-submitted" : "";
				return `
					<button type="button" class="sr-result ${active}" data-name="${esc(row.name)}">
						<div class="sr-result-name" dir="auto">${esc(name)}</div>
						<div class="sr-result-meta">
							<span>${esc(bits.join(" · "))}</span>
							<span class="sr-chip ${chip}">${esc(status_label(row.docstatus))}</span>
						</div>
					</button>`;
			})
			.join("");
	};

	StudentRegister.prototype.new_student = function () {
		this.selected = null;
		this.student = {};
		this.read_only = false;
		this.$title.textContent = __("New student");
		this.$help.textContent = __(
			"Saving submits the student. When a grade is set, the fee invoice is created."
		);
		this.$banner.hidden = true;
		this.$banner.textContent = "";
		this.$open.hidden = true;
		this.set_status("");
		this.set_values({});
		this.set_read_only(false);
		this.render_list();
		this.root.querySelector('[data-field="student_id"]').focus();
	};

	StudentRegister.prototype.open_student = function (name) {
		call("edu.edu.page.student_desk.student_desk.get_student", { name }).then((student) => {
			this.show_student(student);
		});
	};

	StudentRegister.prototype.show_student = function (student) {
		if (!student) {
			return;
		}
		this.selected = student.name;
		this.student = student;
		this.read_only = cint(student.docstatus) !== 0;
		this.$title.textContent =
			[student.student_name, student.last_name].filter(Boolean).join(" ") || student.student_id;
		this.$help.textContent = `${student.student_id} · ${status_label(student.docstatus)}`;
		this.$open.hidden = false;
		this.$open.href = `/desk/student/${encodeURIComponent(student.name)}`;
		if (this.read_only) {
			this.$banner.hidden = false;
			this.$banner.textContent = __(
				"This student is submitted. Open the Student document to change it."
			);
		} else {
			this.$banner.hidden = true;
			this.$banner.textContent = "";
		}
		this.set_values(student);
		this.set_read_only(this.read_only);
		this.render_list();
	};

	StudentRegister.prototype.set_values = function (student) {
		this.root.querySelectorAll("[data-field]").forEach((element) => {
			const value = student[element.dataset.field];
			if (element.type === "checkbox") {
				element.checked = cint(value) === 1;
			} else if (element.type === "number") {
				element.value = value ? value : "";
			} else {
				element.value = value || "";
			}
		});
	};

	StudentRegister.prototype.set_read_only = function (read_only) {
		this.root.querySelectorAll(".sr-save").forEach((button) => {
			button.disabled = read_only || this.saving;
		});
		this.root.querySelectorAll("[data-field]").forEach((element) => {
			element.disabled = read_only;
		});
		if (!read_only && this.selected) {
			this.root.querySelector('[data-field="student_id"]').disabled = true;
		}
	};

	StudentRegister.prototype.values = function () {
		const data = { name: this.selected };
		this.root.querySelectorAll("[data-field]").forEach((element) => {
			data[element.dataset.field] = element.type === "checkbox" ? (element.checked ? 1 : 0) : element.value;
		});
		return data;
	};

	StudentRegister.prototype.save = function () {
		if (this.read_only || this.saving) {
			return;
		}
		this.saving = true;
		this.set_status(__("Saving"));
		this.set_read_only(false);
		call("edu.edu.page.student_desk.student_desk.save_student", { data: this.values() })
			.then((student) => {
				this.show_student(student);
				this.set_status(__("Saved"), "ok");
				return this.refresh_list();
			})
			.catch((error) => {
				this.set_status(error_message(error), "error");
			})
			.finally(() => {
				this.saving = false;
				this.set_read_only(this.read_only);
			});
	};

	StudentRegister.prototype.set_status = function (text, kind) {
		this.$status.textContent = text || "";
		this.$status.dataset.kind = kind || "";
	};

	function call(method, args) {
		return new Promise((resolve, reject) => {
			frappe.call({
				method,
				args,
				callback: (response) => resolve(response.message),
				error: (response) => reject(response),
			});
		});
	}

	function status_label(docstatus) {
		if (cint(docstatus) === 1) {
			return __("Submitted");
		}
		if (cint(docstatus) === 2) {
			return __("Cancelled");
		}
		return __("Draft");
	}

	function cint(value) {
		const number = parseInt(value, 10);
		return Number.isNaN(number) ? 0 : number;
	}

	function esc(value) {
		return String(value ?? "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	function error_message(response) {
		const payload = response?.responseJSON || response || {};
		const messages = payload._server_messages;
		if (messages) {
			try {
				const parsed = JSON.parse(messages).map((row) => JSON.parse(row));
				const text = parsed.map((row) => row.message).filter(Boolean).join(" ");
				if (text) {
					return text.replace(/<[^>]+>/g, "");
				}
			} catch (error) {
				return __("Could not save the student");
			}
		}
		return __("Could not save the student");
	}

	new StudentRegister(root).start();
})();
