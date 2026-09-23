class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const patterns = {
  phoneIndia: /^(?:\+91|0)?[6-9]\d{9}$/,
  phoneAny: /^\+?\d{7,15}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  postalIndia: /^[1-9]\d{5}$/,
  postalOther: /^[A-Za-z0-9][A-Za-z0-9\s-]{2,9}$/,
  paymentStatus: ["pending", "submitted", "verified", "rejected", "refunded"],
  fulfilmentStatus: ["pending", "processing", "packed", "shipped", "delivered"],
};

function requireString(value, { field, min = 1, max = 300 }) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max) {
    throw new HttpError(400, `Invalid value for ${field}.`);
  }
  return text;
}

function normalizePhone(rawPhone, country) {
  const digits = String(rawPhone || "").replace(/[\s\-()]/g, "");
  if (country === "India" || !country) {
    if (!patterns.phoneIndia.test(digits)) {
      throw new HttpError(400, "Enter a valid 10-digit Indian mobile number.");
    }
    return digits.slice(-10);
  }
  if (!patterns.phoneAny.test(digits)) {
    throw new HttpError(400, "Enter a valid phone number.");
  }
  return digits;
}

function validateOrderPayload(body) {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Request body is required.");
  }

  const customer = body.customer || {};
  const shipping = body.shipping || {};

  const name = requireString(customer.name, { field: "customer name", min: 2, max: 120 });

  const email = typeof customer.email === "string" ? customer.email.trim() : "";
  if (email && !patterns.email.test(email)) {
    throw new HttpError(400, "Enter a valid email address.");
  }

  const country = requireString(shipping.country, { field: "country", min: 2, max: 60 });
  const phone = normalizePhone(customer.phone, country);

  const address = requireString(shipping.address, { field: "address", min: 6, max: 300 });
  const city = requireString(shipping.city, { field: "city", min: 1, max: 80 });
  const state = requireString(shipping.state, { field: "state", min: 2, max: 80 });

  const postalCode = String(shipping.postalCode || "").trim();
  const postalValid =
    country === "India"
      ? patterns.postalIndia.test(postalCode)
      : patterns.postalOther.test(postalCode);
  if (!postalValid) {
    throw new HttpError(
      400,
      country === "India"
        ? "Enter a valid 6-digit PIN code."
        : "Enter a valid postal code."
    );
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length < 1 || rawItems.length > 50) {
    throw new HttpError(400, "Order must contain at least one item.");
  }

  const seen = new Set();
  const items = rawItems.map((line, index) => {
    const productId =
      line && typeof line.productId === "string" ? line.productId.trim() : "";
    if (!productId) {
      throw new HttpError(400, `Item ${index + 1} is missing a product id.`);
    }
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw new HttpError(400, `Invalid quantity for ${productId}.`);
    }
    if (seen.has(productId)) {
      throw new HttpError(400, `Duplicate item in order: ${productId}.`);
    }
    seen.add(productId);
    return { productId, qty };
  });

  return {
    customer: { name, phone, email },
    shipping: { address, city, state, postalCode, country },
    items,
  };
}

module.exports = {
  HttpError,
  asyncRoute,
  patterns,
  requireString,
  normalizePhone,
  validateOrderPayload,
};
