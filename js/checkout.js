/* Checkout + order confirmation (frontend prototype).

   BACKEND REQUIRED: real order creation, price/stock validation, UPI details and
   payment verification must be performed by the backend. This file only collects
   input, validates it in the browser and stores the order in sessionStorage so
   the confirmation page can display it. sessionStorage is temporary and is not
   an order database. */

window.Numis = window.Numis || {};

(function () {
  var ACTIVE_ORDER_KEY = "numistrade_active_order";

  // Demo flat fee — BACKEND REQUIRED for real shipping rates.
  var DELIVERY_FEE = 50;
  var FREE_DELIVERY_OVER = 2000;

  function shippingFee(subtotal) {
    if (subtotal <= 0) return 0;
    return subtotal >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;
  }

  function readActiveOrder() {
    try {
      var raw = sessionStorage.getItem(ACTIVE_ORDER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveActiveOrder(order) {
    try {
      sessionStorage.setItem(ACTIVE_ORDER_KEY, JSON.stringify(order));
    } catch (error) {
      /* sessionStorage may be unavailable */
    }
  }

  function generateOrderId() {
    var year = new Date().getFullYear();
    var digits = String(Math.floor(1000 + Math.random() * 9000));
    return "NT-" + year + digits;
  }

  /* ---------- Checkout page ---------- */

  function setFieldError(input, message) {
    var errorEl = document.getElementById(input.id + "-error");
    if (message) {
      input.classList.add("is-invalid");
      input.setAttribute("aria-invalid", "true");
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.hidden = false;
      }
    } else {
      input.classList.remove("is-invalid");
      input.removeAttribute("aria-invalid");
      if (errorEl) {
        errorEl.textContent = "";
        errorEl.hidden = true;
      }
    }
  }

  function validateForm(form) {
    var errors = [];

    var nameInput = form.elements.fullName;
    if (nameInput.value.trim().length < 2) {
      setFieldError(nameInput, "Please enter your full name.");
      errors.push(nameInput);
    } else {
      setFieldError(nameInput, "");
    }

    var phoneInput = form.elements.phone;
    var phoneDigits = phoneInput.value.replace(/[\s\-()]/g, "");
    if (!/^(?:\+91|0)?[6-9]\d{9}$/.test(phoneDigits)) {
      setFieldError(phoneInput, "Enter a valid 10-digit Indian mobile number (starts with 6–9).");
      errors.push(phoneInput);
    } else {
      setFieldError(phoneInput, "");
    }

    var emailInput = form.elements.email;
    if (emailInput.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailInput.value.trim())) {
      setFieldError(emailInput, "Enter a valid email address, or leave it blank.");
      errors.push(emailInput);
    } else {
      setFieldError(emailInput, "");
    }

    var addressInput = form.elements.address;
    if (addressInput.value.trim().length < 6) {
      setFieldError(addressInput, "Please enter your full delivery address.");
      errors.push(addressInput);
    } else {
      setFieldError(addressInput, "");
    }

    var cityInput = form.elements.city;
    if (!cityInput.value.trim()) {
      setFieldError(cityInput, "Please enter your city.");
      errors.push(cityInput);
    } else {
      setFieldError(cityInput, "");
    }

    var stateInput = form.elements.state;
    if (stateInput.value.trim().length < 2) {
      setFieldError(stateInput, "Please enter your state.");
      errors.push(stateInput);
    } else {
      setFieldError(stateInput, "");
    }

    var countryInput = form.elements.country;
    var postalInput = form.elements.postalCode;
    var isIndia = countryInput.value === "India";
    var postal = postalInput.value.trim();
    var postalValid = isIndia ? /^[1-9]\d{5}$/.test(postal) : /^[A-Za-z0-9][A-Za-z0-9\s-]{2,9}$/.test(postal);
    if (!postalValid) {
      setFieldError(
        postalInput,
        isIndia
          ? "Enter a valid 6-digit PIN code (first digit cannot be 0)."
          : "Enter a valid postal code."
      );
      errors.push(postalInput);
    } else {
      setFieldError(postalInput, "");
    }

    return errors;
  }

  function renderCheckoutSummary(items, subtotal, fee, total) {
    var itemsEl = document.getElementById("summary-items");
    if (itemsEl) {
      itemsEl.innerHTML = items
        .map(function (item) {
          var line = (Number(item.price) || 0) * (Number(item.qty) || 0);
          return (
            '<div class="summary-item">' +
            '<span class="summary-item-name">' +
            Numis.ui.escapeHtml(item.name) +
            " × " +
            (Number(item.qty) || 1) +
            "</span>" +
            "<span>" +
            Numis.ui.formatINR(line) +
            "</span>" +
            "</div>"
          );
        })
        .join("");
    }

    var setText = function (id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText("summary-subtotal", Numis.ui.formatINR(subtotal));
    setText("summary-delivery", fee === 0 ? "Free" : Numis.ui.formatINR(fee));
    setText("summary-total", Numis.ui.formatINR(total));
  }

  function initCheckout() {
    var form = document.getElementById("checkout-form");
    if (!form) return;

    var emptyEl = document.getElementById("checkout-empty");
    var layoutEl = document.getElementById("checkout-layout");

    function render() {
      var items = Numis.cart.getItems();
      if (!items.length) {
        if (emptyEl) emptyEl.hidden = false;
        if (layoutEl) layoutEl.hidden = true;
        return;
      }
      if (emptyEl) emptyEl.hidden = true;
      if (layoutEl) layoutEl.hidden = false;

      var subtotal = Numis.cart.subtotal();
      var fee = shippingFee(subtotal);
      renderCheckoutSummary(items, subtotal, fee, subtotal + fee);
    }

    render();

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var items = Numis.cart.getItems();
      if (!items.length) {
        render();
        return;
      }

      var invalid = validateForm(form);
      if (invalid.length) {
        invalid[0].focus();
        Numis.ui.showToast("Please fix the highlighted fields.");
        return;
      }

      var now = new Date().toISOString();
      var subtotal = Numis.cart.subtotal();
      var fee = shippingFee(subtotal);

      var order = {
        orderId: generateOrderId(),
        customer: {
          name: form.elements.fullName.value.trim(),
          phone: form.elements.phone.value.trim(),
          email: form.elements.email.value.trim()
        },
        shipping: {
          address: form.elements.address.value.trim(),
          city: form.elements.city.value.trim(),
          state: form.elements.state.value.trim(),
          postalCode: form.elements.postalCode.value.trim(),
          country: form.elements.country.value
        },
        items: items.map(function (item) {
          return {
            productId: item.id,
            name: item.name,
            price: Number(item.price) || 0,
            qty: Number(item.qty) || 1,
            lineTotal: (Number(item.price) || 0) * (Number(item.qty) || 1)
          };
        }),
        subtotal: subtotal,
        shippingFee: fee,
        total: subtotal + fee,
        payment: {
          method: "UPI",
          status: "pending",
          reference: ""
        },
        fulfillment: {
          status: "pending",
          trackingNumber: "",
          carrier: ""
        },
        createdAt: now,
        updatedAt: now
      };

      // Prototype only: stored in this browser tab so the confirmation page can
      // display it. BACKEND REQUIRED: the backend must create and store orders.
      saveActiveOrder(order);
      Numis.cart.clear();
      window.location.href = "order-success.html";
    });
  }

  /* ---------- Order confirmation page ---------- */

  function paymentBadgeClass(status) {
    var map = {
      pending: "badge-pending",
      submitted: "badge-submitted",
      verified: "badge-verified",
      rejected: "badge-rejected",
      refunded: "badge-submitted"
    };
    return map[status] || "badge-pending";
  }

  function fulfillmentBadgeClass(status) {
    var map = {
      pending: "badge-pending",
      processing: "badge-processing",
      packed: "badge-packed",
      shipped: "badge-shipped",
      delivered: "badge-delivered",
      cancelled: "badge-cancelled"
    };
    return map[status] || "badge-pending";
  }

  function formatStatus(status) {
    return String(status || "pending").charAt(0).toUpperCase() + String(status || "pending").slice(1);
  }

  function renderOrderSuccess(order) {
    var root = document.getElementById("order-success");
    var ui = Numis.ui;
    var payment = order.payment || {};
    var fulfillment = order.fulfillment || {};
    var submitted = payment.status === "submitted" || payment.status === "verified";

    var itemsHTML = (order.items || [])
      .map(function (item) {
        return (
          "<li><span>" +
          ui.escapeHtml(item.name) +
          " × " +
          item.qty +
          "</span><span>" +
          ui.formatINR(item.lineTotal) +
          "</span></li>"
        );
      })
      .join("");

    var shipping = order.shipping || {};
    var customer = order.customer || {};

    var referenceSection = submitted
      ? '<div class="notice notice-info">' +
        "<strong>Payment reference recorded:</strong> " +
        ui.escapeHtml(payment.reference) +
        "<br>" +
        "Status: " +
        ui.escapeHtml(formatStatus(payment.status)) +
        " — awaiting manual verification. " +
        "BACKEND REQUIRED: once the backend is connected this reference is sent to the store. " +
        "Keep your payment proof (screenshot / UTR) safe.</div>"
      : '<form class="reference-form" id="reference-form" novalidate>' +
        '<div class="field">' +
        '<label for="payment-reference">Payment reference / UTR (optional)</label>' +
        '<input class="form-control" type="text" id="payment-reference" name="paymentReference" ' +
        'autocomplete="off" placeholder="e.g. 4150XXXXXXXX">' +
        '<p class="field-error" id="payment-reference-error" role="alert" hidden></p>' +
        "</div>" +
        '<button type="submit" class="btn btn-navy">Submit Reference</button>' +
        "</form>" +
        '<p class="hint">Submitting a reference does <strong>not</strong> confirm payment. ' +
        "The store verifies every payment manually before processing the order.</p>";

    root.innerHTML =
      '<div class="state-panel">' +
      '<p class="eyebrow">Order received</p>' +
      "<h1>Thank you — your order has been placed.</h1>" +
      '<div class="order-id-box">' + ui.escapeHtml(order.orderId) + "</div>" +
      '<div class="notice">Order will be processed after payment verification. ' +
      "Please complete the UPI payment below.</div>" +

      "<h2>Order summary</h2>" +
      '<ul class="order-items-list">' +
      itemsHTML +
      "</ul>" +
      '<div class="summary-row"><span>Subtotal</span><span>' + ui.formatINR(order.subtotal) + "</span></div>" +
      '<div class="summary-row"><span>Delivery charge</span><span>' +
      (Number(order.shippingFee) === 0 ? "Free" : ui.formatINR(order.shippingFee)) +
      "</span></div>" +
      '<div class="summary-row summary-total"><span>Total</span><span>' +
      ui.formatINR(order.total) +
      "</span></div>" +

      "<h2>Delivery address</h2>" +
      '<div class="shipping-block">' +
      "<p><strong>" + ui.escapeHtml(customer.name || "") + "</strong></p>" +
      "<p>" + ui.escapeHtml(shipping.address || "") + "</p>" +
      "<p>" +
      ui.escapeHtml(
        [shipping.city, shipping.state, shipping.postalCode].filter(Boolean).join(", ")
      ) +
      "</p>" +
      "<p>" + ui.escapeHtml(shipping.country || "") + "</p>" +
      (customer.phone ? "<p>Phone: " + ui.escapeHtml(customer.phone) + "</p>" : "") +
      "</div>" +

      "<h2>Payment (UPI)</h2>" +
      '<div class="payment-status-row">' +
      '<span class="badge ' + paymentBadgeClass(payment.status) + '">Payment: ' +
      ui.escapeHtml(formatStatus(payment.status)) +
      "</span>" +
      "</div>" +
      '<div class="upi-box">' +
      '<div class="upi-amount">Pay ' + ui.formatINR(order.total) + "</div>" +
      "Pay the exact order amount using UPI." +
      '<div class="upi-placeholder">' +
      "BACKEND REQUIRED — the store UPI ID and QR code will appear here " +
      "once payment details are configured on the backend. " +
      "No payment credentials are stored in this static site." +
      "</div>" +
      '<ol class="pay-steps">' +
      "<li>Pay <strong>" + ui.formatINR(order.total) + "</strong> via UPI once the QR / UPI ID is available.</li>" +
      "<li>Optionally record your payment reference (UTR) below.</li>" +
      "<li>The store verifies the payment manually and confirms your order.</li>" +
      "<li>After verification your order is packed and dispatched with tracking.</li>" +
      "</ol>" +
      "</div>" +
      '<div style="margin-top: 16px;">' + referenceSection + "</div>" +

      "<h2>Fulfilment</h2>" +
      '<div class="fulfillment-status-row">' +
      '<span class="badge ' + fulfillmentBadgeClass(fulfillment.status) + '">Fulfilment: ' +
      ui.escapeHtml(formatStatus(fulfillment.status)) +
      "</span>" +
      "</div>" +
      '<p class="hint">Tracking details will be shared after the order is dispatched.</p>' +

      '<p style="margin-top: 26px;">' +
      '<a href="products.html" class="btn btn-outline">Continue shopping</a>' +
      "</p>" +
      "</div>";

    var referenceForm = document.getElementById("reference-form");
    if (referenceForm) {
      referenceForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var input = referenceForm.elements.paymentReference;
        var value = input.value.trim();
        var errorEl = document.getElementById("payment-reference-error");

        if (value.length < 4) {
          input.classList.add("is-invalid");
          input.setAttribute("aria-invalid", "true");
          if (errorEl) {
            errorEl.textContent = "Enter your UPI reference / UTR (at least 4 characters).";
            errorEl.hidden = false;
          }
          input.focus();
          return;
        }

        order.payment = order.payment || { method: "UPI", status: "pending", reference: "" };
        order.payment.reference = value;
        order.payment.status = "submitted";
        order.updatedAt = new Date().toISOString();
        saveActiveOrder(order);
        Numis.ui.showToast("Payment reference recorded.");
        renderOrderSuccess(order);
      });
    }
  }

  function initOrderSuccess() {
    var root = document.getElementById("order-success");
    if (!root) return;

    var order = readActiveOrder();
    if (!order || !order.orderId) {
      root.innerHTML =
        '<div class="state-panel">' +
        "<h1>No recent order found.</h1>" +
        '<p class="hint">If you just placed an order, reopen the confirmation link in the same browser tab. ' +
        "Order history and status lookup will arrive with the backend.</p>" +
        '<p style="margin-top: 20px;"><a href="index.html" class="btn btn-gold">Go to home</a></p>' +
        "</div>";
      return;
    }

    document.title = "Order " + order.orderId + " | NumisTrade";
    renderOrderSuccess(order);
  }

  document.addEventListener("DOMContentLoaded", function () {
    initCheckout();
    initOrderSuccess();
  });

  Numis.checkout = {
    DELIVERY_FEE: DELIVERY_FEE,
    FREE_DELIVERY_OVER: FREE_DELIVERY_OVER
  };
})();
