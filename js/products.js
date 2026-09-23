/* Product catalog: loads data/products.json and renders catalog UI. */

window.Numis = window.Numis || {};

(function () {
  var CATEGORIES = [
    {
      slug: "ancient-coins",
      name: "Ancient Coins",
      icon: "🏛️",
      description: "Historic coins from earlier civilizations"
    },
    {
      slug: "british-india",
      name: "British India",
      icon: "👑",
      description: "Coins from the British Indian period"
    },
    {
      slug: "republic-india",
      name: "Republic India",
      icon: "🇮🇳",
      description: "Coins issued after Indian independence"
    },
    {
      slug: "world-coins",
      name: "World Coins",
      icon: "🌎",
      description: "Collectible coins from around the world"
    },
    {
      slug: "commemorative",
      name: "Commemorative",
      icon: "🏅",
      description: "Special issues and commemorative coins"
    },
    {
      slug: "other-collectibles",
      name: "Other Collectibles",
      icon: "✨",
      description: "Tokens, medals and related collectibles"
    }
  ];

  var productsCache = null;
  var productsPromise = null;

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function loadErrorMessage() {
    return (
      '<p class="state-message">Could not load the product catalog. ' +
      'If you are testing on your computer, serve the site with a local web server ' +
      '(see README.md) and refresh the page.</p>'
    );
  }

  function loadProducts() {
    if (productsCache) return Promise.resolve(productsCache);
    if (!productsPromise) {
      productsPromise = fetch("data/products.json", { cache: "no-cache" })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (data) {
          var list = Array.isArray(data) ? data : data.products || [];
          productsCache = list.filter(function (product) {
            return product && product.active !== false;
          });
          return productsCache;
        })
        .catch(function (error) {
          productsPromise = null;
          throw error;
        });
    }
    return productsPromise;
  }

  function getAll() {
    return productsCache || [];
  }

  function getById(id) {
    if (!id) return null;
    return (
      getAll().find(function (product) {
        return product.id === id || product.slug === id;
      }) || null
    );
  }

  function productCardHTML(product) {
    var ui = Numis.ui;
    var stock = Number(product.stock) || 0;
    var inStock = stock > 0;
    var image = product.images && product.images[0];
    var media = image
      ? '<img src="' + ui.escapeHtml(image) + '" alt="' + ui.escapeHtml(product.name) + '" loading="lazy">'
      : '<span class="product-placeholder" aria-hidden="true">NT</span>';

    var meta = [
      ui.formatYear(product.year),
      product.country || "",
      product.condition || ""
    ]
      .filter(Boolean)
      .map(ui.escapeHtml)
      .join(" · ");

    return (
      '<article class="product-card">' +
      '<a class="product-card-link" href="product.html?id=' + ui.escapeHtml(product.id) + '">' +
      '<div class="product-media">' + media + "</div>" +
      '<div class="product-card-body">' +
      '<div class="product-card-top">' +
      '<span class="product-category">' + ui.escapeHtml(product.category) + "</span>" +
      (product.demo ? '<span class="badge badge-sample">Sample</span>' : "") +
      "</div>" +
      '<h3 class="product-card-title">' + ui.escapeHtml(product.name) + "</h3>" +
      '<p class="product-meta">' + meta + "</p>" +
      '<div class="product-card-bottom">' +
      '<span class="price">' + ui.formatINR(product.price) + "</span>" +
      '<span class="badge ' + (inStock ? "badge-in-stock" : "badge-out-of-stock") + '">' +
      (inStock ? "In stock" : "Out of stock") +
      "</span>" +
      "</div>" +
      "</div>" +
      "</a>" +
      '<div class="product-card-actions">' +
      '<button type="button" class="btn btn-navy btn-block" data-add-to-cart="' +
      ui.escapeHtml(product.id) +
      '"' +
      (inStock ? "" : " disabled") +
      ">" +
      (inStock ? "Add to Cart" : "Out of Stock") +
      "</button>" +
      "</div>" +
      "</article>"
    );
  }

  function renderCategories() {
    var grid = document.getElementById("category-grid");
    if (!grid) return;
    var ui = Numis.ui;
    grid.innerHTML = CATEGORIES.map(function (category) {
      return (
        '<a class="category" href="products.html?category=' + encodeURIComponent(category.slug) + '">' +
        '<span class="category-icon" aria-hidden="true">' + category.icon + "</span>" +
        "<h3>" + ui.escapeHtml(category.name) + "</h3>" +
        "<p>" + ui.escapeHtml(category.description) + "</p>" +
        "</a>"
      );
    }).join("");
  }

  function renderFeatured() {
    var grid = document.getElementById("featured-products");
    if (!grid) return;
    grid.innerHTML = '<p class="state-message">Loading coins…</p>';
    loadProducts()
      .then(function (products) {
        var featured = products.filter(function (product) {
          return product.featured;
        });
        if (!featured.length) {
          grid.innerHTML =
            '<p class="state-message">No featured coins yet. <a href="products.html">Browse all coins</a>.</p>';
          return;
        }
        grid.innerHTML = featured.map(productCardHTML).join("");
      })
      .catch(function () {
        grid.innerHTML = loadErrorMessage();
      });
  }

  function sortProducts(list, sort) {
    var copy = list.slice();
    switch (sort) {
      case "price-asc":
        return copy.sort(function (a, b) {
          return (Number(a.price) || 0) - (Number(b.price) || 0);
        });
      case "price-desc":
        return copy.sort(function (a, b) {
          return (Number(b.price) || 0) - (Number(a.price) || 0);
        });
      case "name-asc":
        return copy.sort(function (a, b) {
          return String(a.name).localeCompare(String(b.name));
        });
      case "year-desc":
        return copy.sort(function (a, b) {
          return (Number(b.year) || 0) - (Number(a.year) || 0);
        });
      default:
        return copy.sort(function (a, b) {
          return Number(!!b.featured) - Number(!!a.featured);
        });
    }
  }

  function matchesQuery(product, query) {
    if (!query) return true;
    var haystack = [
      product.name,
      product.category,
      product.country,
      product.condition,
      product.denomination,
      product.year,
      product.slug
    ]
      .join(" ")
      .toLowerCase();
    return haystack.indexOf(query) !== -1;
  }

  function initListing() {
    var root = document.getElementById("catalog");
    if (!root) return;

    var params = new URLSearchParams(window.location.search);
    var state = {
      category: params.get("category") || "all",
      q: params.get("q") || "",
      sort: params.get("sort") || "featured",
      inStockOnly: params.get("stock") === "only"
    };

    var chipsEl = root.querySelector("[data-category-chips]");
    var countEl = root.querySelector("[data-catalog-count]");
    var gridEl = document.getElementById("catalog-grid");
    var searchEl = document.getElementById("catalog-search");
    var sortEl = document.getElementById("catalog-sort");
    var stockEl = document.getElementById("catalog-stock");
    var allProducts = [];

    if (searchEl) searchEl.value = state.q;
    if (sortEl) sortEl.value = state.sort;
    if (stockEl) stockEl.checked = state.inStockOnly;

    function applyUrl() {
      var next = new URLSearchParams();
      if (state.category !== "all") next.set("category", state.category);
      if (state.q) next.set("q", state.q);
      if (state.sort !== "featured") next.set("sort", state.sort);
      if (state.inStockOnly) next.set("stock", "only");
      var qs = next.toString();
      try {
        window.history.replaceState(null, "", qs ? "products.html?" + qs : "products.html");
      } catch (error) {
        /* history may be unavailable on some file:// setups */
      }
    }

    function renderChips() {
      if (!chipsEl) return;
      var items = [{ slug: "all", name: "All Coins" }].concat(CATEGORIES);
      chipsEl.innerHTML = items
        .map(function (item) {
          var active = state.category === item.slug;
          return (
            '<button type="button" class="chip' +
            (active ? " is-active" : "") +
            '" data-chip-category="' +
            item.slug +
            '" aria-pressed="' +
            active +
            '">' +
            Numis.ui.escapeHtml(item.name) +
            "</button>"
          );
        })
        .join("");
    }

    function getFiltered() {
      var query = state.q.trim().toLowerCase();
      var filtered = allProducts.filter(function (product) {
        if (state.category !== "all" && slugify(product.category) !== state.category) return false;
        if (state.inStockOnly && !(Number(product.stock) > 0)) return false;
        return matchesQuery(product, query);
      });
      return sortProducts(filtered, state.sort);
    }

    function render() {
      applyUrl();
      renderChips();
      var results = getFiltered();
      if (countEl) {
        countEl.textContent =
          results.length === 1 ? "1 coin found" : results.length + " coins found";
      }
      gridEl.innerHTML = results.length
        ? results.map(productCardHTML).join("")
        : '<p class="state-message">No coins match your filters. Try a different category or search term.</p>';
    }

    if (chipsEl) {
      chipsEl.addEventListener("click", function (event) {
        var chip = event.target.closest("[data-chip-category]");
        if (!chip) return;
        state.category = chip.getAttribute("data-chip-category");
        render();
      });
    }

    if (searchEl) {
      searchEl.addEventListener("input", function () {
        state.q = searchEl.value;
        render();
      });
    }

    if (sortEl) {
      sortEl.addEventListener("change", function () {
        state.sort = sortEl.value;
        render();
      });
    }

    if (stockEl) {
      stockEl.addEventListener("change", function () {
        state.inStockOnly = stockEl.checked;
        render();
      });
    }

    gridEl.innerHTML = '<p class="state-message">Loading coins…</p>';
    loadProducts()
      .then(function (products) {
        allProducts = products;
        render();
      })
      .catch(function () {
        if (countEl) countEl.textContent = "";
        gridEl.innerHTML = loadErrorMessage();
      });
  }

  function detailHTML(product) {
    var ui = Numis.ui;
    var stock = Number(product.stock) || 0;
    var inStock = stock > 0;
    var images = (product.images || []).filter(Boolean);
    var mainImage = images[0];
    var media = mainImage
      ? '<img src="' + ui.escapeHtml(mainImage) + '" alt="' + ui.escapeHtml(product.name) + '">'
      : '<span class="product-placeholder" aria-hidden="true">NT</span>';

    var thumbs =
      images.length > 1
        ? '<div class="thumbs" role="group" aria-label="Product images">' +
          images
            .map(function (src, index) {
              return (
                '<button type="button" class="thumb' +
                (index === 0 ? " is-active" : "") +
                '" data-thumb-src="' +
                ui.escapeHtml(src) +
                '" aria-label="View image ' +
                (index + 1) +
                '">' +
                '<img src="' +
                ui.escapeHtml(src) +
                '" alt="">' +
                "</button>"
              );
            })
            .join("") +
          "</div>"
        : "";

    var specRows = [
      ["Year", ui.formatYear(product.year)],
      ["Country", product.country || "—"],
      ["Denomination", product.denomination || "—"],
      ["Condition", product.condition || "—"],
      ["Category", product.category || "—"],
      ["Availability", inStock ? stock + " in stock" : "Out of stock"]
    ]
      .map(function (row) {
        return (
          '<div class="spec-row"><dt>' +
          ui.escapeHtml(row[0]) +
          "</dt><dd>" +
          ui.escapeHtml(row[1]) +
          "</dd></div>"
        );
      })
      .join("");

    return (
      '<div class="detail-layout">' +
      "<div>" +
      '<div class="product-media product-media-large" id="detail-main-media">' +
      media +
      "</div>" +
      thumbs +
      "</div>" +
      "<div>" +
      '<div class="detail-category-row">' +
      '<span class="product-category">' + ui.escapeHtml(product.category) + "</span>" +
      (product.demo ? '<span class="badge badge-sample">Sample listing</span>' : "") +
      "</div>" +
      '<h1 class="detail-title">' + ui.escapeHtml(product.name) + "</h1>" +
      '<div class="detail-price-row">' +
      '<span class="price price-lg">' + ui.formatINR(product.price) + "</span>" +
      '<span class="badge ' + (inStock ? "badge-in-stock" : "badge-out-of-stock") + '">' +
      (inStock ? "In stock" : "Out of stock") +
      "</span>" +
      "</div>" +
      '<p class="detail-desc">' + ui.escapeHtml(product.description || "") + "</p>" +
      '<h2 class="visually-hidden">Coin details</h2>' +
      '<dl class="spec-list">' + specRows + "</dl>" +
      '<div class="detail-actions">' +
      '<div class="qty-control">' +
      '<button type="button" data-detail-qty-delta="-1" aria-label="Decrease quantity"' +
      (inStock ? "" : " disabled") +
      ">−</button>" +
      '<input type="number" id="detail-qty" value="1" min="1" max="' +
      Math.max(stock, 1) +
      '" aria-label="Quantity"' +
      (inStock ? "" : " disabled") +
      ">" +
      '<button type="button" data-detail-qty-delta="1" aria-label="Increase quantity"' +
      (inStock ? "" : " disabled") +
      ">+</button>" +
      "</div>" +
      '<button type="button" class="btn btn-navy" data-detail-action="add"' +
      (inStock ? "" : " disabled") +
      ">" +
      (inStock ? "Add to Cart" : "Out of Stock") +
      "</button>" +
      '<button type="button" class="btn btn-gold" data-detail-action="buy"' +
      (inStock ? "" : " disabled") +
      ">Buy Now</button>" +
      "</div>" +
      '<p class="hint">Prices are in INR. Orders are processed after payment verification.</p>' +
      "</div>" +
      "</div>"
    );
  }

  function initDetail() {
    var root = document.getElementById("product-detail");
    if (!root) return;

    var params = new URLSearchParams(window.location.search);
    var key = params.get("id") || params.get("slug");

    root.innerHTML = '<p class="state-message">Loading coin…</p>';

    loadProducts()
      .then(function () {
        var product = getById(key);
        if (!product) {
          root.innerHTML =
            '<p class="state-message">Coin not found. <a href="products.html">Browse all coins</a>.</p>';
          return;
        }

        document.title = product.name + " | NumisTrade";
        var meta = document.querySelector('meta[name="description"]');
        if (meta && product.description) {
          meta.setAttribute(
            "content",
            product.name + " — " + String(product.description).slice(0, 150)
          );
        }

        root.innerHTML = detailHTML(product);

        var stock = Number(product.stock) || 0;
        var qtyInput = root.querySelector("#detail-qty");

        function clampQty(value) {
          var parsed = parseInt(value, 10);
          if (isNaN(parsed) || parsed < 1) parsed = 1;
          if (stock > 0 && parsed > stock) parsed = stock;
          return parsed;
        }

        root.addEventListener("click", function (event) {
          var deltaBtn = event.target.closest("[data-detail-qty-delta]");
          if (deltaBtn && qtyInput) {
            var delta = Number(deltaBtn.getAttribute("data-detail-qty-delta"));
            qtyInput.value = clampQty((parseInt(qtyInput.value, 10) || 1) + delta);
            return;
          }

          var thumb = event.target.closest("[data-thumb-src]");
          if (thumb) {
            var mainMedia = root.querySelector("#detail-main-media");
            if (mainMedia) {
              mainMedia.innerHTML =
                '<img src="' +
                Numis.ui.escapeHtml(thumb.getAttribute("data-thumb-src")) +
                '" alt="' +
                Numis.ui.escapeHtml(product.name) +
                '">';
            }
            root.querySelectorAll(".thumb").forEach(function (el) {
              el.classList.toggle("is-active", el === thumb);
            });
            return;
          }

          var actionBtn = event.target.closest("[data-detail-action]");
          if (!actionBtn || actionBtn.disabled) return;
          var qty = qtyInput ? clampQty(qtyInput.value) : 1;
          if (qtyInput) qtyInput.value = qty;
          var added = Numis.cart.add(product.id, qty);
          if (added && actionBtn.getAttribute("data-detail-action") === "buy") {
            window.location.href = "checkout.html";
          }
        });

        if (qtyInput) {
          qtyInput.addEventListener("change", function () {
            qtyInput.value = clampQty(qtyInput.value);
          });
        }
      })
      .catch(function () {
        root.innerHTML = loadErrorMessage();
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderCategories();
    renderFeatured();
    initListing();
    initDetail();
  });

  Numis.products = {
    CATEGORIES: CATEGORIES,
    loadProducts: loadProducts,
    getAll: getAll,
    getById: getById,
    productCardHTML: productCardHTML,
    slugify: slugify
  };
})();
