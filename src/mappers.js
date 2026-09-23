function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function productRowToApi(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    year: row.year == null ? null : Number(row.year),
    country: row.country,
    denomination: row.denomination,
    condition: row.condition,
    price: Number(row.price),
    currency: row.currency,
    stock: Number(row.stock),
    images: parseJson(row.images, []),
    description: row.description,
    featured: !!row.featured,
    active: !!row.active,
    demo: !!row.demo,
  };
}

function orderRowToApi(row) {
  return {
    orderId: row.order_id,
    customer: {
      name: row.customer_name,
      phone: row.customer_phone,
      email: row.customer_email,
    },
    shipping: {
      address: row.address,
      city: row.city,
      state: row.state,
      postalCode: row.postal_code,
      country: row.country,
    },
    items: parseJson(row.items, []),
    subtotal: Number(row.subtotal),
    shippingFee: Number(row.shipping_fee),
    total: Number(row.total),
    payment: {
      method: row.payment_method,
      status: row.payment_status,
      reference: row.payment_reference,
    },
    fulfilment: {
      status: row.fulfilment_status,
      trackingNumber: row.tracking_number,
      carrier: row.carrier,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { productRowToApi, orderRowToApi };
