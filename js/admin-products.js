/* Admin editor for the static catalog (category listings).

   Loads data/products.json into an editable working copy. Changes are NOT
   saved to the site automatically — a static host cannot write files. Instead:
   Download products.json (or copy it), replace data/products.json in the repo,
   and git push. See the on-page workflow hint.

   Only rendered after admin gate passes (admin-auth.js). */

window.Numis = window.Numis || {};

(function () {
  var FIXED_CATEGORIES = [
    { slug: "ancient-coins", name: "Ancient Coins" },
    { slug: "british-india", name: "British India" },
    { slug: "republic-india", name: "Republic India" },
    { slug: "world-coins", name: "World Coins" },
    { slug: "commemorative", name: "Commemorative" },
    { slug: "other-collectibles", name: "Other Collectibles" }
  ];

  var original = [];
  var products = [];
  var editingId = null;
  var root;

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function loadCatalog() {
    return fetch("data/products.json", { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var list = Array.isArray(data) ? data : data.products || [];
        original = JSON.parse(JSON.stringify(list));
        products = JSON.parse(JSON.stringify(list));
      });
  }

  function categoryName(slug) {
    var found = FIXED_CATEGORIES.find(function (c) { return c.slug === slug; });
    if (found) return found.name;
    return slug ? fallbackName(slug) : "Uncategorized";
  }

  function fallbackName(slug) {
    return slug.replace(/-/g, " ").replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

  function orderedGroups() {
    var map = {};
    products.forEach(function (p) {
      var key = slugify(p.category) || "__uncat__";
      (map[key] = map[key] || { name: key === "__uncat__" ? "Uncategorized" : categoryName(key), items: [] }).items.push(p);
    });
    var keys = FIXED_CATEGORIES.map(function (c) { return c.slug; })
      .concat(Object.keys(map).filter(function (k) { return k !== "__uncat__" && !FIXED_CATEGORIES.some(function (c) { return c.slug === k; }); }).sort());
    if (map.__uncat__) keys.push("__uncat__");
    return { map: map, keys: keys };
  }

  function counts() {
    var added = products.filter(function (p) {
      return !original.some(function (o) { return o.id === p.id; });
    }).length;
    var removed = original.filter(function (o) {
      return !products.some(function (p) { return p.id === o.id; });
    }).length;
    var changed = products.filter(function (p) {
      var o = original.find(function (x) { return x.id === p.id; });
      return o && JSON.stringify(o) !== JSON.stringify(p);
    }).length;
    return { added: added, removed: removed, changed: changed };
  }

  function field(name, value) {
    return {
      id: (p) => p.id, name: (p) => p.name, slug: (p) => p.slug,
      category: (p) => p.category, year: (p) => p.year, country: (p) => p.country,
      denomination: (p) => p.denomination, condition: (p) => p.condition,
      price: (p) => p.price, currency: (p) => p.currency || "INR", stock: (p) => p.stock,
      images: (p) => Array.isArray(p.images) ? p.images.join(", ") : "",
      description: (p) => p.description || "", featured: (p) => !!p.featured,
      active: (p) => p.active !== false, demo: (p) => !!p.demo
    }[name](value);
  }

  function renderSummary() {
    var el = document.getElementById("admin-summary");
    var c = counts();
    el.innerHTML =
      "<strong>" + products.length + "</strong> listings" +
      (c.added ? " · <strong class='text-add'>+" + c.added + " new</strong>" : "") +
      (c.changed ? " · <strong class='text-change'>" + c.changed + " edited</strong>" : "") +
      (c.removed ? " · <strong class='text-remove'>−" + c.removed + " removed</strong>" : "");
  }

  function renderGroups() {
    var groups = orderedGroups();
    var html = "";
    groups.keys.forEach(function (key) {
      var g = groups.map[key];
      html +=
        '<section class="admin-group">' +
        "<h2>" + escapeHtml(g.name) + ' <span class="count">' + g.items.length + "</span></h2>" +
        '<table class="admin-table">' +
        "<thead><tr><th>ID</th><th>Name</th><th>Price</th><th>Stock</th><th>Year</th><th>Status</th><th></th></tr></thead><tbody>" +
        g.items
          .map(function (p) {
            var o = original.find(function (x) { return x.id === p.id; });
            var badge = p.active === false ? '<span class="badge badge-rejected">inactive</span>'
              : (p.stock <= 0 ? '<span class="badge badge-pending">out of stock</span>' : '<span class="badge badge-verified">active</span>');
            var changed = o && JSON.stringify(o) !== JSON.stringify(p) ? ' <em class="text-change">(edited)</em>' : "";
            return (
              "<tr>" +
              "<td>" + escapeHtml(p.id) + "</td>" +
              "<td>" + escapeHtml(p.name) + changed + "</td>" +
              "<td>" + Numis.ui.formatINR(p.price) + "</td>" +
              "<td>" + escapeHtml(String(p.stock)) + "</td>" +
              "<td>" + escapeHtml(String(p.year == null ? "" : p.year)) + "</td>" +
              "<td>" + badge + "</td>" +
              "<td class='row-actions'>" +
              '<button type="button" class="btn btn-outline btn-sm" data-edit="' + escapeHtml(p.id) + '">Edit</button> ' +
              '<button type="button" class="btn btn-outline btn-sm btn-danger" data-delete="' + escapeHtml(p.id) + '">Delete</button>' +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table></section>";
    });
    root.querySelector("[data-admin-groups]").innerHTML =
      html || '<p class="state-message">No listings yet. Add the first one.</p>';
    renderSummary();
  }

  function renderEditor() {
    var form = document.getElementById("admin-form");
    var editing = editingId ? products.find(function (p) { return p.id === editingId; }) : null;
    var categoryOptions = FIXED_CATEGORIES
      .map(function (c) { return '<option value="' + escapeHtml(c.slug) + '">' + escapeHtml(c.name) + "</option>"; })
      .join("");

    form.innerHTML =
      "<h2>" + (editing ? "Edit listing" : "Add listing") + "</h2>" +
      '<div class="form-grid">' +
      '<div class="field"><label for="p-id">ID</label><input id="p-id" class="form-control" value="' + escapeHtml(field("id", editing)) + '" placeholder="coin-013"' + (editing ? " disabled" : "") + " required></div>" +
      '<div class="field"><label for="p-name">Name *</label><input id="p-name" class="form-control" value="' + escapeHtml(field("name", editing)) + '" required></div>' +
      '<div class="field"><label for="p-slug">Slug</label><input id="p-slug" class="form-control" value="' + escapeHtml(field("slug", editing)) + '" placeholder="auto from name"></div>' +
      '<div class="field"><label for="p-category">Category *</label><input id="p-category" class="form-control" list="category-list" value="' + escapeHtml(field("category", editing)) + '" required><datalist id="category-list">' +
      categoryOptions +
      (products.length ? products.map(function (p) { return p.category ? '<option value="' + escapeHtml(p.category) + '">' : ""; }).join("") : "") +
      "</datalist></div>" +
      '<div class="field"><label for="p-year">Year</label><input id="p-year" class="form-control" type="number" value="' + escapeHtml(field("year", editing)) + '"></div>' +
      '<div class="field"><label for="p-country">Country</label><input id="p-country" class="form-control" value="' + escapeHtml(field("country", editing)) + '"></div>' +
      '<div class="field"><label for="p-denomination">Denomination</label><input id="p-denomination" class="form-control" value="' + escapeHtml(field("denomination", editing)) + '"></div>' +
      '<div class="field"><label for="p-condition">Condition</label><input id="p-condition" class="form-control" value="' + escapeHtml(field("condition", editing)) + '"></div>' +
      '<div class="field"><label for="p-price">Price (INR) *</label><input id="p-price" class="form-control" type="number" min="0" step="1" value="' + escapeHtml(field("price", editing)) + '" required></div>' +
      '<div class="field"><label for="p-stock">Stock *</label><input id="p-stock" class="form-control" type="number" min="0" step="1" value="' + escapeHtml(field("stock", editing)) + '" required></div>' +
      '<div class="field"><label for="p-images">Image URLs (comma separated)</label><textarea id="p-images" class="form-control" rows="2">' + escapeHtml(field("images", editing)) + "</textarea></div>" +
      '<div class="field field-wide"><label for="p-description">Description</label><textarea id="p-description" class="form-control" rows="3">' + escapeHtml(field("description", editing)) + "</textarea></div>" +
      "</div>" +
      '<div class="checks">' +
      '<label class="check"><input type="checkbox" id="p-featured"' + (field("featured", editing) ? " checked" : "") + "> Featured on homepage</label>" +
      '<label class="check"><input type="checkbox" id="p-active"' + (field("active", editing) ? " checked" : "") + "> Active</label>" +
      '<label class="check"><input type="checkbox" id="p-demo"' + (field("demo", editing) ? " checked" : "") + "> Demo / sample listing</label>" +
      "</div>" +
      '<div class="form-actions">' +
      '<button type="button" class="btn btn-gold" data-save>Save listing</button> ' +
      '<button type="button" class="btn btn-outline" data-cancel>Cancel</button>' +
      "</div>";

    form.hidden = false;
    form.querySelector("[data-cancel]").addEventListener("click", function () {
      editingId = null;
      form.hidden = true;
    });
    form.querySelector("[data-save]").addEventListener("click", function () { saveFromForm(); });
  }

  function saveFromForm() {
    var form = document.getElementById("admin-form");
    var nameEl = form.querySelector("#p-name");
    var price = Number(form.querySelector("#p-price").value);
    var stock = Number(form.querySelector("#p-stock").value) || 0;

    if (!nameEl.value.trim()) return Numis.ui.showToast("Name is required.");
    if (!Number.isFinite(price) || price < 0) return Numis.ui.showToast("Enter a valid price.");
    if (!Number.isFinite(stock) || stock < 0) return Numis.ui.showToast("Enter a valid stock.");

    var id = editingId || form.querySelector("#p-id").value.trim();
    var slug = form.querySelector("#p-slug").value.trim() || slugify(nameEl.value);
    var images = form.querySelector("#p-images").value
      .split(",")
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    if (!id) return Numis.ui.showToast("ID is required (e.g. coin-013).");
    if (!editingId && products.some(function (p) { return p.id === id; })) {
      return Numis.ui.showToast('ID "' + id + '" already exists.');
    }

    var product = {
      id: id,
      name: nameEl.value.trim(),
      slug: slug,
      category: form.querySelector("#p-category").value.trim(),
      year: form.querySelector("#p-year").value ? Number(form.querySelector("#p-year").value) : null,
      country: form.querySelector("#p-country").value.trim(),
      denomination: form.querySelector("#p-denomination").value.trim(),
      condition: form.querySelector("#p-condition").value.trim(),
      price: Math.round(price),
      currency: "INR",
      stock: Math.round(stock),
      images: images,
      description: form.querySelector("#p-description").value.trim(),
      featured: form.querySelector("#p-featured").checked,
      active: form.querySelector("#p-active").checked,
      demo: form.querySelector("#p-demo").checked
    };

    var idx = products.findIndex(function (p) { return p.id === product.id; });
    if (idx >= 0) products[idx] = product;
    else products.push(product);
    products.sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });

    editingId = null;
    form.hidden = true;
    renderGroups();
    Numis.ui.showToast("Saved to working copy — remember to export & push.");
  }

  function exportJSON() {
    return JSON.stringify({ products: products }, null, 2);
  }

  function download() {
    var blob = new Blob([exportJSON()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "products.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Numis.ui.showToast("products.json downloaded.");
  }

  function copyJSON() {
    return navigator.clipboard.writeText(exportJSON()).then(function () {
      Numis.ui.showToast("Catalog JSON copied to clipboard.");
    });
  }

  function importJSON(text) {
    var data = JSON.parse(text || "{}");
    var list = Array.isArray(data) ? data : data.products;
    if (!Array.isArray(list)) throw new Error("Expected an array or { products: [...] }.");
    products = list;
    renderGroups();
    Numis.ui.showToast("Imported " + list.length + " listings (working copy).");
  }

  function bindToolbar() {
    root.querySelector("[data-add]").addEventListener("click", function () {
      editingId = null;
      renderEditor();
    });
    root.querySelector("[data-download]").addEventListener("click", download);
    root.querySelector("[data-copy]").addEventListener("click", function () {
      copyJSON().catch(function () { exportJSON(); Numis.ui.showToast("Copy blocked by browser."); });
    });
    root.querySelector("[data-import]").addEventListener("click", function () {
      var text = window.prompt("Paste catalog JSON (array or { products: [...] }):");
      if (text == null) return;
      try {
        importJSON(text);
      } catch (err) {
        Numis.ui.showToast("Import failed: " + err.message);
      }
    });
    root.querySelector("[data-reset]").addEventListener("click", function () {
      if (!window.confirm("Discard all unsaved edits?")) return;
      products = JSON.parse(JSON.stringify(original));
      renderGroups();
      Numis.ui.showToast("Working copy reset to the published catalog.");
    });
    root.querySelector("[data-admin-groups]").addEventListener("click", function (event) {
      var editBtn = event.target.closest("[data-edit]");
      if (editBtn) {
        editingId = editBtn.getAttribute("data-edit");
        renderEditor();
        return;
      }
      var delBtn = event.target.closest("[data-delete]");
      if (delBtn) {
        var id = delBtn.getAttribute("data-delete");
        if (!window.confirm("Delete listing " + id + "?")) return;
        products = products.filter(function (p) { return p.id !== id; });
        renderGroups();
        return;
      }
    });
  }

  function render() {
    root = document.getElementById("admin-editor");
    if (!root) return;
    bindToolbar();
    loadCatalog().then(renderGroups).catch(function (err) {
      root.querySelector("[data-admin-groups]").innerHTML =
        '<p class="state-message">Could not load data/products.json: ' + escapeHtml(err.message) + "</p>";
    });
  }

  function escapeHtml(value) {
    return Numis.ui.escapeHtml(String(value == null ? "" : value));
  }

  document.addEventListener("DOMContentLoaded", render);
})();