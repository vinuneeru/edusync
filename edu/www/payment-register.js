(() => {
	const root = document.querySelector("#payment-register");
	if (!root) {
		return;
	}

	const API = "edu.www.payment_register";

	function PaymentRegister(root) {
		this.root = root;
		this.query = "";
		this.currency = "";
		this.list_status = "";
		this.selected = null;
		this.payment = null;
		this.records = [];
		this.matches = [];
		this.pending_files = [];
		this.defaults = { today: "", banks: {} };
		this.read_only = false;
		this.saving = false;
		this.attaching = false;
		this.quiet = false;
		this.request_id = 0;
		this.$query = root.querySelector(".sr-query");
		this.$list_label = root.querySelector(".sr-list-label");
		this.$list = root.querySelector(".sr-list");
		this.$title = root.querySelector(".sr-title");
		this.$help = root.querySelector(".sr-help");
		this.$banner = root.querySelector(".sr-banner");
		this.$status = root.querySelector(".sr-status");
		this.$open = root.querySelector(".sr-open");
		this.$suggest = root.querySelector(".sr-suggest");
		this.$invoice_note = root.querySelector(".sr-invoice-note");
		this.$bank = root.querySelector(".sr-bank");
		this.$files = root.querySelector(".sr-files");
		this.$file = root.querySelector(".sr-file");
	}

	PaymentRegister.prototype.start = function () {
		this.$query.addEventListener("input", () => {
			this.query = this.$query.value;
			clearTimeout(this.search_timer);
			this.search_timer = setTimeout(() => this.refresh_list(), 200);
		});
		this.$query.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				if (this.records[0]) {
					this.open_payment(this.records[0].name);
				}
			}
		});
		this.root.addEventListener("click", (event) => {
			const result = event.target.closest(".sr-result");
			if (result) {
				this.open_payment(result.dataset.name);
				return;
			}
			const suggestion = event.target.closest(".sr-suggest button");
			if (suggestion) {
				const match = this.matches.find((row) => row.name === suggestion.dataset.name);
				if (match) {
					this.choose_student(match);
				}
				return;
			}
			if (!event.target.closest(".sr-student")) {
				this.hide_suggestions();
			}
			const remove_file = event.target.closest(".sr-file-remove");
			if (remove_file) {
				this.pending_files.splice(Number(remove_file.dataset.index), 1);
				this.render_files();
				return;
			}
			if (event.target.closest(".sr-attach-btn")) {
				this.$file.click();
				return;
			}
			if (event.target.closest(".sr-new")) {
				this.new_payment();
			}
			if (event.target.closest(".sr-save")) {
				this.save();
			}
		});
		this.$file.addEventListener("change", () => {
			const files = [...this.$file.files];
			this.$file.value = "";
			if (!files.length || this.attaching) {
				return;
			}
			if (!this.selected) {
				this.pending_files.push(...files);
				this.render_files();
				return;
			}
			this.attaching = true;
			this.set_status(__("Attaching"));
			this.upload_all(this.selected, files)
				.then(() => call(`${API}.get_payment`, { name: this.selected }))
				.then((payment) => {
					this.show_payment(payment);
					this.set_status(__("Saved"), "ok");
				})
				.catch((error) => {
					this.set_status(error_message(error, "Could not attach the file"), "error");
				})
				.finally(() => {
					this.attaching = false;
				});
		});
		const currency_filter = this.root.querySelector(".sr-currency-filter");
		const status_filter = this.root.querySelector(".sr-status-filter");
		currency_filter.addEventListener("change", () => {
			this.currency = currency_filter.value;
			this.refresh_list();
		});
		status_filter.addEventListener("change", () => {
			this.list_status = status_filter.value;
			this.refresh_list();
		});
		const student_id = this.field("student_id");
		student_id.addEventListener("input", () => {
			if (this.quiet) {
				return;
			}
			this.set_field("student_name", "");
			this.set_field("sales_invoice", "");
			this.$invoice_note.textContent = "";
			clearTimeout(this.lookup_timer);
			this.lookup_timer = setTimeout(() => this.lookup_student(), 200);
		});
		this.field("currency").addEventListener("change", () => this.show_bank());
		call(`${API}.get_form_defaults`).then((defaults) => {
			this.defaults = defaults || this.defaults;
			if (!this.selected) {
				this.new_payment();
			}
		});
		this.refresh_list();
	};

	PaymentRegister.prototype.refresh_list = function () {
		const request_id = ++this.request_id;
		const filtering = Boolean(this.query.trim() || this.currency || this.list_status);
		this.$list_label.textContent = filtering ? __("Results") : __("Recent");
		return call(`${API}.search_payments`, {
			query: this.query,
			currency: this.currency,
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

	PaymentRegister.prototype.render_list = function () {
		if (!this.records.length) {
			const message = this.query.trim() || this.currency || this.list_status
				? __("No matching payments")
				: __("No payments yet");
			this.$list.innerHTML = `<div class="sr-empty">${esc(message)}</div>`;
			return;
		}
		this.$list.innerHTML = this.records
			.map((row) => {
				const bits = [row.posting_date, `${row.amount} ${row.currency || ""}`.trim()];
				if (row.student_id) {
					bits.push(row.student_id);
				}
				if (row.reference_no) {
					bits.push(row.reference_no);
				}
				const active = row.name === this.selected ? "is-active" : "";
				const chip = cint(row.docstatus) === 1 ? "is-submitted" : "";
				return `
					<button type="button" class="sr-result ${active}" data-name="${esc(row.name)}">
						<div class="sr-result-name" dir="auto">${esc(row.display_name || row.party)}</div>
						<div class="sr-result-meta">
							<span>${esc(bits.join(" · "))}</span>
							<span class="sr-chip ${chip}">${esc(status_label(row.docstatus))}</span>
						</div>
					</button>`;
			})
			.join("");
	};

	PaymentRegister.prototype.new_payment = function () {
		this.selected = null;
		this.payment = null;
		this.read_only = false;
		this.matches = [];
		this.pending_files = [];
		this.hide_suggestions();
		this.$title.textContent = __("New payment");
		this.$help.textContent = __(
			"Saving submits the payment and records it against the fee invoice. Any amount above the invoice stays on the customer as an advance."
		);
		this.$banner.hidden = true;
		this.$banner.textContent = "";
		this.$open.hidden = true;
		this.$invoice_note.textContent = "";
		this.set_status("");
		this.set_values({ posting_date: this.defaults.today || "" });
		this.show_bank();
		this.render_files();
		this.set_read_only(false);
		this.render_list();
		this.field("student_id").focus();
	};

	PaymentRegister.prototype.open_payment = function (name) {
		this.hide_suggestions();
		call(`${API}.get_payment`, { name }).then((payment) => this.show_payment(payment));
	};

	PaymentRegister.prototype.show_payment = function (payment) {
		if (!payment) {
			return;
		}
		this.selected = payment.name;
		this.payment = payment;
		this.read_only = cint(payment.docstatus) !== 0;
		this.$title.textContent = payment.student_name || payment.party || payment.name;
		this.$help.textContent = `${payment.name} · ${status_label(payment.docstatus)}`;
		this.$open.hidden = false;
		this.$open.href = `/desk/payment-entry/${encodeURIComponent(payment.name)}`;
		if (this.read_only) {
			this.$banner.hidden = false;
			this.$banner.textContent = __("This payment is submitted. Open the Payment Entry to change it.");
		} else {
			this.$banner.hidden = true;
			this.$banner.textContent = "";
		}
		this.set_values(payment);
		this.show_invoice(payment);
		this.show_bank(payment.paid_to);
		this.pending_files = [];
		this.render_files();
		this.set_read_only(this.read_only);
		this.render_list();
	};

	PaymentRegister.prototype.lookup_student = function () {
		const text = this.field("student_id").value.trim();
		if (!text || this.read_only) {
			this.hide_suggestions();
			return;
		}
		call(`${API}.lookup_students`, { query: text }).then((rows) => {
			if (this.field("student_id").value.trim() !== text) {
				return;
			}
			this.matches = rows || [];
			const exact = this.matches.filter(
				(row) => String(row.student_id).toLowerCase() === text.toLowerCase()
			);
			if (exact.length === 1) {
				this.choose_student(exact[0]);
				return;
			}
			this.render_suggestions();
		});
	};

	PaymentRegister.prototype.render_suggestions = function () {
		this.$suggest.hidden = false;
		if (!this.matches.length) {
			this.$suggest.innerHTML = `<div class="sr-empty">${esc(__("No matching students"))}</div>`;
			return;
		}
		this.$suggest.innerHTML = this.matches
			.map(
				(row) => `
				<button type="button" data-name="${esc(row.name)}">
					<span class="sr-suggest-name" dir="auto">${esc(row.display_name || row.student_id)}</span>
					<span class="sr-suggest-id">${esc(row.student_id)}</span>
				</button>`
			)
			.join("");
	};

	PaymentRegister.prototype.choose_student = function (row) {
		this.hide_suggestions();
		this.set_field("student_id", row.student_id);
		this.set_field("student_name", row.display_name || "");
		this.set_field("sales_invoice", row.sales_invoice || "");
		this.show_invoice(row);
	};

	PaymentRegister.prototype.hide_suggestions = function () {
		this.$suggest.hidden = true;
		this.$suggest.innerHTML = "";
	};

	PaymentRegister.prototype.show_invoice = function (row) {
		if (row && Object.prototype.hasOwnProperty.call(row, "docstatus")) {
			const parts = [];
			if (row.sales_invoice) {
				parts.push(row.sales_invoice);
			}
			parts.push(`${__("Allocated")} ${row.allocated_amount}`);
			parts.push(`${__("Unallocated")} ${row.unallocated_amount}`);
			this.$invoice_note.textContent = parts.join(" · ");
			return;
		}
		if (!row || !row.sales_invoice) {
			this.$invoice_note.textContent = __(
				"No fee invoice. The amount stays as an advance on the customer."
			);
			return;
		}
		if (Number(row.outstanding_amount) <= 0) {
			this.$invoice_note.textContent = __(
				"This invoice is already paid. The amount stays as an advance on the customer."
			);
			return;
		}
		const money = [row.outstanding_amount, row.invoice_currency].filter((part) => part || part === 0).join(" ");
		this.$invoice_note.textContent = `${__("Outstanding")} ${money}`;
	};

	PaymentRegister.prototype.show_bank = function (account) {
		const currency = this.field("currency").value;
		const bank = account || this.defaults.banks?.[currency]?.account;
		this.$bank.textContent = bank ? `${__("Received into")} ${bank}` : "";
	};

	PaymentRegister.prototype.set_values = function (payment) {
		this.quiet = true;
		this.root.querySelectorAll("[data-field]").forEach((element) => {
			const value = payment[element.dataset.field];
			element.value = value || value === 0 ? value : "";
		});
		this.quiet = false;
	};

	PaymentRegister.prototype.set_field = function (fieldname, value) {
		this.quiet = true;
		this.field(fieldname).value = value || "";
		this.quiet = false;
	};

	PaymentRegister.prototype.set_read_only = function (read_only) {
		this.root.querySelectorAll(".sr-save").forEach((button) => {
			button.disabled = read_only || this.saving;
		});
		this.root.querySelectorAll("[data-field]").forEach((element) => {
			if (element.dataset.field === "student_name" || element.dataset.field === "sales_invoice") {
				element.readOnly = true;
				element.disabled = read_only;
				return;
			}
			if (element.tagName === "SELECT") {
				element.disabled = read_only;
			} else {
				element.readOnly = read_only;
				element.disabled = false;
			}
		});
	};

	PaymentRegister.prototype.values = function () {
		const data = { name: this.selected };
		this.root.querySelectorAll("[data-field]").forEach((element) => {
			data[element.dataset.field] = element.value;
		});
		return data;
	};

	PaymentRegister.prototype.save = function () {
		if (this.read_only || this.saving) {
			return;
		}
		this.saving = true;
		this.set_status(__("Saving"));
		this.set_read_only(false);
		const pending = this.pending_files.slice();
		call(`${API}.save_payment`, { data: this.values() })
			.then((payment) => {
				const finish = (saved) => {
					this.show_payment(saved);
					this.set_status(__("Saved"), "ok");
					return this.refresh_list();
				};
				if (!pending.length) {
					return finish(payment);
				}
				return this.upload_all(payment.name, pending)
					.then(() => call(`${API}.get_payment`, { name: payment.name }))
					.then(finish)
					.catch((error) => {
						return call(`${API}.get_payment`, { name: payment.name })
							.catch(() => payment)
							.then((saved) => {
								this.show_payment(saved);
								const attached = new Set((saved.attachments || []).map((row) => row.file_name));
								this.pending_files = pending.filter((file) => !attached.has(file.name));
								this.render_files();
								this.set_status(error_message(error, "Could not attach the file"), "error");
								return this.refresh_list();
							});
					});
			})
			.catch((error) => {
				this.set_status(error_message(error), "error");
			})
			.finally(() => {
				this.saving = false;
				this.set_read_only(this.read_only);
			});
	};

	PaymentRegister.prototype.upload_all = function (name, files) {
		return files.reduce(
			(chain, file) => chain.then(() => upload_attachment(file, name)),
			Promise.resolve()
		);
	};

	PaymentRegister.prototype.render_files = function () {
		const saved = (this.payment && this.payment.attachments) || [];
		const pending = this.pending_files || [];
		if (!saved.length && !pending.length) {
			this.$files.innerHTML = "";
			return;
		}
		const saved_html = saved
			.map(
				(row) => `
				<li>
					<a href="${esc(row.file_url)}" target="_blank" rel="noopener">${esc(row.file_name)}</a>
				</li>`
			)
			.join("");
		const pending_html = pending
			.map(
				(file, index) => `
				<li>
					<span>${esc(file.name)}</span>
					<button type="button" class="text-btn sr-file-remove" data-index="${index}">${esc(__("Remove"))}</button>
					<span class="sr-note">${esc(__("Attaches when you save"))}</span>
				</li>`
			)
			.join("");
		this.$files.innerHTML = saved_html + pending_html;
	};

	PaymentRegister.prototype.set_status = function (text, kind) {
		this.$status.textContent = text || "";
		this.$status.dataset.kind = kind || "";
	};

	PaymentRegister.prototype.field = function (fieldname) {
		return this.root.querySelector(`[data-field="${fieldname}"]`);
	};

	function upload_attachment(file, docname) {
		const body = new FormData();
		body.append("file", file, file.name);
		body.append("doctype", "Payment Entry");
		body.append("docname", docname);
		body.append("is_private", "1");
		body.append("folder", "Home");
		return fetch("/api/method/upload_file", {
			method: "POST",
			headers: {
				Accept: "application/json",
				"X-Frappe-CSRF-Token": frappe.csrf_token,
			},
			body,
		}).then(async (response) => {
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const error = new Error("upload failed");
				error.responseJSON = payload;
				throw error;
			}
			return payload.message;
		});
	}

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

	function error_message(response, fallback) {
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
				return __(fallback || "Could not save the payment");
			}
		}
		return __(fallback || "Could not save the payment");
	}

	new PaymentRegister(root).start();
})();
