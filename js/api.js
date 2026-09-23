/* HTTP client for the NumisTrade backend.
   Every call fails soft: callers fall back to static/demo behaviour when the
   API is not configured or unreachable. The backend is the only authority for
   prices, stock and orders — the browser never decides those. */

window.Numis = window.Numis || {};

(function () {
  function base() {
    return String(Numis.apiBase || "").replace(/\/+$/, "");
  }

  function canUseApi() {
    return base().length > 0;
  }

  function request(path, options) {
    return fetch(base() + path, options).then(function (response) {
      return response
        .json()
        .catch(function () {
          return null;
        })
        .then(function (data) {
          if (!response.ok) {
            var error = new Error(
              (data && data.error) || "Request failed (" + response.status + ")"
            );
            error.status = response.status;
            error.data = data;
            throw error;
          }
          return data;
        });
    });
  }

  function jsonRequest(method, path, body) {
    return request(path, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function mapProduct(product) {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      category: product.category,
      year: product.year == null ? null : Number(product.year),
      country: product.country,
      denomination: product.denomination,
      condition: product.condition,
      price: Number(product.price) || 0,
      currency: product.currency || "INR",
      stock: Number(product.stock) || 0,
      images: Array.isArray(product.images) ? product.images : [],
      description: product.description,
      featured: !!product.featured,
      active: product.active !== false,
      demo: !!product.demo,
    };
  }

  Numis.api = {
    canUseApi: canUseApi,

    listProducts: function () {
      return request("/api/products").then(function (data) {
        return (data.products || []).map(mapProduct);
      });
    },

    getProduct: function (productId) {
      return request("/api/products/" + encodeURIComponent(productId)).then(function (data) {
        return mapProduct(data.product);
      });
    },

    createOrder: function (payload) {
      return jsonRequest("POST", "/api/orders", payload).then(function (data) {
        return data.order;
      });
    },

    getOrder: function (orderId, phone) {
      return request(
        "/api/orders/" +
          encodeURIComponent(orderId) +
          "?phone=" +
          encodeURIComponent(phone)
      ).then(function (data) {
        return data.order;
      });
    },

    submitReference: function (orderId, phone, reference) {
      return jsonRequest("POST", "/api/orders/" + encodeURIComponent(orderId) + "/reference", {
        phone: phone,
        reference: reference,
      }).then(function (data) {
        return data.order;
      });
    },
  };
})();