/* Cart — localStorage holds UI state only; the backend will be authoritative later. */

window.Numis = window.Numis || {};

(function () {
  var STORAGE_KEY = "numistrade_cart_v1";

  function getItems() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function write(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      /* storage may be unavailable in private mode */
    }
    refreshBadge();
    document.dispatchEvent(new CustomEvent("cart:change"));
  }

  function refreshBadge() {
    var count = totalQuantity();
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = String(count);
    });
  }

  function totalQuantity() {
    return getItems().reduce(function (sum, item) {
      return sum + (Number(item.qty) || 0);
    }, 0);
  }

  function subtotal() {
    return getItems().reduce(function (sum, item) {
      return sum + (Number(item.price) || 0) * (Number(item.qty) || 0);
    }, 0);
  }

  function stockFor(productId) {
    var product = Numis.products && Numis.products.getById(productId);
    if (product) return Number(product.stock) || 0;
    return null;
  }

  function add(productId, qty) {
    var product = Numis.products && Numis.products.getById(productId);
    if (!product) {
      Numis.ui.showToast("This coin could not be found.");
      return false;
    }

    var stock = Number(product.stock) || 0;
    if (stock <= 0) {
      Numis.ui.showToast("This coin is out of stock.");
      return false;
    }

    var items = getItems();
    var existing = items.find(function (item) {
      return item.id === product.id;
    });
    var currentQty = existing ? Number(existing.qty) || 0 : 0;
    var requested = Math.max(1, Number(qty) || 1);

    if (currentQty >= stock) {
      Numis.ui.showToast("Only " + stock + " available.");
      return false;
    }

    var nextQty = Math.min(currentQty + requested, stock);

    if (existing) {
      existing.qty = nextQty;
    } else {
      items.push({
        id: product.id,
        name: product.name,
        price: Number(product.price) || 0,
        category: product.category || "",
        image: (product.images && product.images[0]) || "",
        qty: nextQty
      });
    }

    write(items);
    Numis.ui.showToast(product.name + " added to cart.");
    return true;
  }

  function setQuantity(productId, qty) {
    var items = getItems();
    var item = items.find(function (entry) {
      return entry.id === productId;
    });
    if (!item) return;

    var next = parseInt(qty, 10);
    if (isNaN(next) || next < 1) next = 1;

    var stock = stockFor(productId);
    var max = stock === null ? 99 : Math.max(stock, 1);
    if (next > max) {
      next = max;
      Numis.ui.showToast("Only " + max + " available.");
    }

    item.qty = next;
    write(items);
  }

  function removeItem(productId) {
    var items = getItems().filter(function (item) {
      return item.id !== productId;
    });
    write(items);
    Numis.ui.showToast("Item removed from cart.");
  }

  function clear() {
    write([]);
  }

  function cartItemHTML(item) {
    var ui = Numis.ui;
    var qty = Number(item.qty) || 1;
    var stock = stockFor(item.id);
    var maxQty = stock === null ? 99 : Math.max(stock, 1);
    var media = item.image
      ? '<img src="' + ui.escapeHtml(item.image) + '" alt="">'
      : "NT";

    return (
      '<div class="cart-item">' +
      '<div class="cart-item-media" aria-hidden="true">' + media + "</div>" +
      "<div>" +
      '<h3 class="cart-item-title">' +
      '<a href="product.html?id=' + ui.escapeHtml(item.id) + '">' + ui.escapeHtml(item.name) + "</a>" +
      "</h3>" +
      '<p class="cart-item-meta">' +
      ui.escapeHtml(item.category || "") +
      " · " +
      ui.formatINR(item.price) +
      " each</p>" +
      "</div>" +
      '<div class="cart-item-controls">' +
      '<div class="qty-control qty-control-small">' +
      '<button type="button" data-cart-qty-delta="-1" data-id="' +
      ui.escapeHtml(item.id) +
      '" aria-label="Decrease quantity of ' +
      ui.escapeHtml(item.name) +
      '">−</button>' +
      '<input type="number" value="' +
      qty +
      '" min="1" max="' +
      maxQty +
      '" data-cart-qty-input data-id="' +
      ui.escapeHtml(item.id) +
      '" aria-label="Quantity of ' +
      ui.escapeHtml(item.name) +
      '">' +
      '<button type="button" data-cart-qty-delta="1" data-id="' +
      ui.escapeHtml(item.id) +
      '" aria-label="Increase quantity of ' +
      ui.escapeHtml(item.name) +
      '">+</button>' +
      "</div>" +
      '<span class="cart-item-price">' + ui.formatINR((Number(item.price) || 0) * qty) + "</span>" +
      '<button type="button" class="remove-btn" data-remove-item="' +
      ui.escapeHtml(item.id) +
      '">Remove</button>' +
      "</div>" +
      "</div>"
    );
  }

  function renderCartPage() {
    var listEl = document.getElementById("cart-items");
    if (!listEl) return;

    var emptyEl = document.getElementById("cart-empty");
    var layoutEl = document.getElementById("cart-layout");
    var items = getItems();

    if (!items.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (layoutEl) layoutEl.hidden = true;
      refreshBadge();
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (layoutEl) layoutEl.hidden = false;

    listEl.innerHTML = items.map(cartItemHTML).join("");

    var sub = Numis.ui.formatINR(
      items.reduce(function (sum, item) {
        return sum + (Number(item.price) || 0) * (Number(item.qty) || 0);
      }, 0)
    );
    document.querySelectorAll("[data-cart-subtotal]").forEach(function (el) {
      el.textContent = sub;
    });
    refreshBadge();
  }

  document.addEventListener("click", function (event) {
    var addButton = event.target.closest("[data-add-to-cart]");
    if (addButton && !addButton.disabled) {
      add(addButton.getAttribute("data-add-to-cart"), 1);
      return;
    }

    var removeButton = event.target.closest("[data-remove-item]");
    if (removeButton) {
      removeItem(removeButton.getAttribute("data-remove-item"));
      return;
    }

    var deltaButton = event.target.closest("[data-cart-qty-delta]");
    if (deltaButton) {
      var id = deltaButton.getAttribute("data-id");
      var delta = Number(deltaButton.getAttribute("data-cart-qty-delta"));
      var current = getItems().find(function (item) {
        return item.id === id;
      });
      if (current) setQuantity(id, (Number(current.qty) || 1) + delta);
    }
  });

  document.addEventListener("change", function (event) {
    var input = event.target.closest("[data-cart-qty-input]");
    if (input) {
      setQuantity(input.getAttribute("data-id"), input.value);
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    refreshBadge();
    renderCartPage();
    document.addEventListener("cart:change", renderCartPage);

    if (document.getElementById("cart-items")) {
      Numis.products.loadProducts().then(renderCartPage).catch(function () {});
    }
  });

  Numis.cart = {
    getItems: getItems,
    add: add,
    setQuantity: setQuantity,
    removeItem: removeItem,
    clear: clear,
    totalQuantity: totalQuantity,
    subtotal: subtotal,
    refreshBadge: refreshBadge
  };
})();
