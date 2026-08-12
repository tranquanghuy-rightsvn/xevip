/*
 * XEVIPSANBAY.COM ORIGINAL MOBILE BOOKING FORM - JS behavior (for real-device overflow testing)
 * Source: https://xevipsanbay.com/script.min.js?v=20260710-video-fs
 * Fetched: 2026-08-12
 *
 * This is the verbatim logic (unminified/renamed only for readability of control flow,
 * no behavior changed) that drives the ".compact-mobile-form" markup: address autocomplete
 * (native <select> overlay appended to <body> — the key detail that keeps long suggestion
 * text from ever affecting the form's layout width), the time picker, trip-mode tab
 * switching, the pickup/destination swap, and vehicle-type population.
 *
 * Deliberately NOT copied (out of scope for the layout bug being tested, and each one
 * touches something outside this form on the host page, which we must not disturb):
 *   - syncHeaderHeight() / --header-height CSS var writes  (this site already defines and
 *     uses --header-height for its own real header; overwriting it would change unrelated UI)
 *   - scrollToMobileBookingSection() auto-scroll-on-load, syncMobileHeroState() body-class
 *     toggling, bindMobileFormFocusState(), setMobileSecondaryExpanded()  (all global,
 *     page-wide side effects with no bearing on the input-overflow bug)
 *   - fetchPriceData()/renderPriceModal()/the real "check price" backend call — depends on
 *     xevipsanbay's private API + a #priceModal element that was not duplicated here.
 *     The submit handler below stops right after running the SAME field validation the
 *     live site runs, then shows a placeholder alert instead of calling the backend.
 */
(function () {
  "use strict";

  var HOST_URL = "https://api.xevipsanbay.com";

  var VehicleTypeEnum = Object.freeze({
    SEAT4: "4_SEAT",
    SEAT5: "5_SEAT",
    SEAT7: "7_SEAT",
    SEAT16: "16_SEAT",
    SEAT29: "29_SEAT",
    SEAT35: "35_SEAT",
    SEAT45: "45_SEAT"
  });

  var VEHICLE_TYPE_OPTIONS = [
    { value: VehicleTypeEnum.SEAT4, label: "Xe 4 chỗ" },
    { value: VehicleTypeEnum.SEAT5, label: "Xe 5 chỗ" },
    { value: VehicleTypeEnum.SEAT7, label: "Xe 7 chỗ" },
    { value: VehicleTypeEnum.SEAT16, label: "Xe 16 chỗ" },
    { value: VehicleTypeEnum.SEAT29, label: "Xe 29 chỗ" },
    { value: VehicleTypeEnum.SEAT35, label: "Xe 35 chỗ" },
    { value: VehicleTypeEnum.SEAT45, label: "Xe 45 chỗ" }
  ];

  var bookingMode = "airport";
  var isFromAirportMobile = false;
  var airportsData = [];

  var SUBMIT_LABEL_AIRPORT = "💰 Kiểm Tra Giá";
  var MOBILE_SUBMIT_LABEL_AIRPORT = "Kiểm tra giá";

  function updateSubmitButtonLabels(mode) {
    var mobileLabel = mode === "longDistance" ? MOBILE_SUBMIT_LABEL_AIRPORT : MOBILE_SUBMIT_LABEL_AIRPORT;
    var quickBtn = document.getElementById("quickSubmitBtn");
    var mobileBtn = document.getElementById("mobileSubmitBtn");
    if (quickBtn) quickBtn.textContent = SUBMIT_LABEL_AIRPORT;
    if (mobileBtn) mobileBtn.textContent = mobileLabel;
  }

  function formatDateToInputValue(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function formatTimeToInputValue(d) {
    var h = String(d.getHours()).padStart(2, "0");
    var m = String(d.getMinutes()).padStart(2, "0");
    return h + ":" + m;
  }

  function isValid24HourTime(v) {
    if (!/^\d{2}:\d{2}$/.test(String(v || ""))) return false;
    var parts = v.split(":");
    var h = Number(parts[0]);
    var m = Number(parts[1]);
    return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
  }

  function getFutureDepartureDateTime(minutesAhead) {
    minutesAhead = minutesAhead === undefined ? 10 : minutesAhead;
    var d = new Date(Date.now() + minutesAhead * 60 * 1000);
    return { date: formatDateToInputValue(d), time: formatTimeToInputValue(d) };
  }

  function getDepartureValidationMessage(dateStr, timeStr) {
    if (!isValid24HourTime(timeStr)) return "Vui lòng nhập giờ theo định dạng 24h HH:mm!";
    var dt = new Date(dateStr + "T" + timeStr);
    if (!dateStr || !timeStr || Number.isNaN(dt.getTime())) return "Ngày đi hoặc giờ đi không hợp lệ!";
    if (dt <= new Date()) return "Ngày đi và giờ đi phải sau thời điểm hiện tại!";
    return "";
  }

  function validateDepartureDateTime(dateStr, timeStr) {
    var msg = getDepartureValidationMessage(dateStr, timeStr);
    if (msg) {
      alert(msg);
      return false;
    }
    return true;
  }

  function populateVehicleTypeSelect(id) {
    var select = document.getElementById(id);
    if (!select) return;
    var current = select.value;
    select.innerHTML = '<option value="">Chọn loại xe</option>';
    VEHICLE_TYPE_OPTIONS.forEach(function (opt) {
      var option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      select.appendChild(option);
    });
    if (current) {
      select.value = current;
    } else if (VEHICLE_TYPE_OPTIONS.length > 0) {
      select.value = VEHICLE_TYPE_OPTIONS[0].value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function populateVehicleTypeSelects() {
    populateVehicleTypeSelect("vehicleType");
    populateVehicleTypeSelect("vehicleTypeMobile");
  }

  function getSelectedVehicleType(mobile) {
    var select = document.getElementById(mobile ? "vehicleTypeMobile" : "vehicleType");
    return (select && select.value) || "";
  }

  var AIRPORTS_API_URL = HOST_URL + "/v1/airports/all";
  var AIRPORT_SELECT_PLACEHOLDER = "Nhập hoặc chọn sân bay";
  var AIRPORT_SELECT_IDS = ["pickupAirportSelect", "destinationAirportSelect", "pickupAirportMobileSelect", "destinationAirportMobileSelect"];

  function extractAirportData(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.items)) return payload.items;
    return [];
  }

  function getAirportId(a) {
    if (!a) return "";
    return a.airportId != null ? a.airportId : a.id != null ? a.id : a._id != null ? a._id : a.uuid != null ? a.uuid : "";
  }

  function getAirportName(a) {
    if (!a) return "Sân bay";
    return a.name != null ? a.name : a.airportName != null ? a.airportName : a.title != null ? a.title : a.code != null ? a.code : "Sân bay";
  }

  function getSelect2Api() {
    var jq = window.jQuery || window.$;
    return jq && jq.fn && jq.fn.select2 ? jq : null;
  }

  function syncAirportSelectUi(el) {
    var jq = getSelect2Api();
    if (jq && el && el.classList.contains("select2-hidden-accessible")) {
      jq(el).trigger("change.select2");
    }
  }

  function initAirportSelect(id) {
    var el = document.getElementById(id);
    var jq = getSelect2Api();
    if (!el || !jq) return;
    var current = el.value;
    var $el = jq(el);
    if ($el.hasClass("select2-hidden-accessible")) $el.select2("destroy");
    $el.select2({
      width: "100%",
      placeholder: AIRPORT_SELECT_PLACEHOLDER,
      allowClear: true,
      minimumResultsForSearch: 0,
      dropdownCssClass: "airport-select2-dropdown",
      language: { noResults: function () { return "Không tìm thấy sân bay"; } }
    });
    if (current) $el.val(current).trigger("change.select2");
  }

  function populateAirportSelect(id) {
    var select = document.getElementById(id);
    if (!select) return;
    var current = select.value;
    select.innerHTML = '<option value="">' + AIRPORT_SELECT_PLACEHOLDER + "</option>";
    airportsData.forEach(function (a) {
      var value = String(getAirportId(a));
      if (!value) return;
      var option = document.createElement("option");
      option.value = value;
      option.textContent = getAirportName(a);
      select.appendChild(option);
    });
    var stillValid = Array.from(select.options).some(function (o) { return o.value === current; });
    select.value = stillValid ? current : "";
    initAirportSelect(id);
  }

  function populateAirportDropdowns() {
    AIRPORT_SELECT_IDS.forEach(populateAirportSelect);
  }

  async function loadAirportData() {
    try {
      var res = await fetch(AIRPORTS_API_URL);
      if (!res.ok) throw new Error("API lỗi: " + res.status);
      var data = await res.json();
      airportsData = extractAirportData(data);
      populateAirportDropdowns();
    } catch (err) {
      console.error("Không thể tải danh sách sân bay:", err);
      populateAirportDropdowns();
    }
  }

  function getSelectedAirport(ids) {
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      var wrap = el && el.closest(".airport-fixed");
      var visible = !!wrap && window.getComputedStyle(wrap).display !== "none";
      if (el && visible && el.value) {
        var match = airportsData.find(function (a) { return String(getAirportId(a)) === String(el.value); });
        if (match) return { airportId: String(getAirportId(match)), airportName: getAirportName(match) };
      }
    }
    return { airportId: "", airportName: "" };
  }

  function getSelectedAddressObject(el) {
    if (!el) return {};
    var raw = el.dataset && el.dataset.place;
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error("Không đọc được địa chỉ đã chọn:", err);
      return {};
    }
  }

  function applyBookingMode(mode, isMobile) {
    updateSubmitButtonLabels(mode);
    var pickupSelects = document.getElementById(isMobile ? "pickupSelectsMobile" : "pickupSelects");
    var pickupAirport = document.getElementById(isMobile ? "pickupAirportMobile" : "pickupAirport");
    var pickupAddress = document.getElementById(isMobile ? "pickupAddressMobile" : "pickupAddress");
    var destinationSelects = document.getElementById(isMobile ? "destinationSelectsMobile" : "destinationSelects");
    var destinationAirport = document.getElementById(isMobile ? "destinationAirportMobile" : "destinationAirport");
    var destinationAddress = document.getElementById(isMobile ? "destinationAddressMobile" : "destinationAddress");

    if (pickupSelects) pickupSelects.style.display = "none";
    if (destinationSelects) destinationSelects.style.display = "none";

    if (mode === "longDistance") {
      if (pickupAirport) pickupAirport.style.display = "none";
      if (pickupAddress) pickupAddress.style.display = "block";
      if (isMobile) {
        var pickupWrap = pickupAddress && pickupAddress.closest(".mobile-inline-icon-field--pickup");
        if (pickupWrap) pickupWrap.style.display = "block";
      }
      if (destinationAirport) destinationAirport.style.display = "none";
      if (destinationAddress) destinationAddress.style.display = "block";
      if (isMobile) {
        var destWrap = destinationAddress && destinationAddress.closest(".mobile-inline-icon-field--pickup");
        if (destWrap) destWrap.style.display = "block";
      }
    } else if (isMobile) {
      setMobilePickupFieldMode(isFromAirportMobile);
      setMobileDestinationFieldMode(!isFromAirportMobile);
    } else {
      if (pickupAirport) pickupAirport.style.display = "none";
      if (pickupAddress) pickupAddress.style.display = "block";
      if (destinationAirport) destinationAirport.style.display = "flex";
      if (destinationAddress) destinationAddress.style.display = "none";
    }
  }

  function setMobilePickupFieldMode(isAirport) {
    var input = document.getElementById("pickupAddressMobile");
    var wrap = input && input.closest(".mobile-inline-icon-field--pickup");
    var airport = document.getElementById("pickupAirportMobile");
    if (wrap) wrap.style.display = isAirport ? "none" : "block";
    if (input) input.style.display = isAirport ? "none" : "block";
    if (airport) airport.style.display = isAirport ? "flex" : "none";
  }

  function setMobileDestinationFieldMode(isAirport) {
    var input = document.getElementById("destinationAddressMobile");
    var wrap = (input && input.closest(".mobile-inline-icon-field--pickup")) || document.getElementById("destinationAddressMobileWrapper");
    var airport = document.getElementById("destinationAirportMobile");
    if (wrap) wrap.style.display = isAirport ? "none" : "block";
    if (input) input.style.display = isAirport ? "none" : "block";
    if (airport) airport.style.display = isAirport ? "flex" : "none";
  }

  function handleMobileSwap() {
    if (bookingMode !== "airport") return;
    var pickupInput = document.getElementById("pickupAddressMobile");
    var destInput = document.getElementById("destinationAddressMobile");
    var pickupAirport = document.getElementById("pickupAirportMobile");
    var destAirport = document.getElementById("destinationAirportMobile");
    var pickupAirportSelect = document.getElementById("pickupAirportMobileSelect");
    var destAirportSelect = document.getElementById("destinationAirportMobileSelect");
    if (!pickupInput || !destInput || !pickupAirport || !destAirport) return;

    if (isFromAirportMobile) {
      if (pickupAirportSelect && destAirportSelect) {
        destAirportSelect.value = pickupAirportSelect.value;
        syncAirportSelectUi(destAirportSelect);
      }
      pickupInput.value = destInput.value || "";
      if (destInput.dataset.place) pickupInput.dataset.place = destInput.dataset.place;
      else delete pickupInput.dataset.place;
      destInput.value = "";
      delete destInput.dataset.place;
      setMobilePickupFieldMode(false);
      setMobileDestinationFieldMode(true);
      isFromAirportMobile = false;
    } else {
      if (pickupAirportSelect && destAirportSelect) {
        pickupAirportSelect.value = destAirportSelect.value;
        syncAirportSelectUi(pickupAirportSelect);
      }
      destInput.value = pickupInput.value || "";
      if (pickupInput.dataset.place) destInput.dataset.place = pickupInput.dataset.place;
      else delete destInput.dataset.place;
      pickupInput.value = "";
      delete pickupInput.dataset.place;
      setMobilePickupFieldMode(true);
      setMobileDestinationFieldMode(false);
      isFromAirportMobile = true;
    }
  }

  function debounce(fn, wait) {
    wait = wait === undefined ? 700 : wait;
    var timer;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  async function fetchAutocompleteSuggestions(query) {
    if (!query) return [];
    try {
      var url = HOST_URL + "/v1/goong-map/autocomplete?input=" + encodeURIComponent(query) + "&has_deprecated_administrative_unit=true";
      var res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        console.error("API response not ok:", res.status, res.statusText);
        return [];
      }
      var data = await res.json();
      return data.predictions || (data.data && data.data.predictions) || [];
    } catch (err) {
      return [];
    }
  }

  // Key layout-safety detail from the source site: the suggestion list is a native
  // <select size="5">, absolutely positioned and appended to <body> — i.e. it lives
  // OUTSIDE the form's flex/grid tree entirely, so no amount of suggestion text can
  // ever push on the form's width. Kept 1:1, including the same element choice.
  function ensureSuggestionBox(input) {
    var box = input._suggestionBox;
    if (box && document.body.contains(box)) return box;
    box = document.createElement("select");
    box.className = "places-suggestions";
    box.id = (input.id || "address") + "-suggestions";
    box.name = (input.name || input.id || "address") + "Suggestions";
    box.setAttribute("aria-label", "Gợi ý địa chỉ");
    box.setAttribute("autocomplete", "off");
    box.size = 5;
    box.style.position = "absolute";
    box.style.zIndex = "9999";
    box.style.background = "#fff";
    box.style.border = "1px solid #ddd";
    box.style.boxShadow = "0 2px 6px rgba(0,0,0,0.12)";
    box.style.maxHeight = "240px";
    box.style.overflowY = "auto";
    box.style.width = Math.max(240, input.offsetWidth) + "px";
    box.style.display = "none";
    box.style.padding = "4px 0";
    document.body.appendChild(box);
    input._suggestionBox = box;

    function reposition() {
      var rect = input.getBoundingClientRect();
      box.style.left = window.pageXOffset + rect.left + "px";
      box.style.top = window.pageYOffset + rect.bottom + "px";
      box.style.width = rect.width + "px";
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return box;
  }

  function attachAutocomplete(inputId) {
    var input = document.getElementById(inputId);
    if (!input) return;
    var box = ensureSuggestionBox(input);

    function renderSuggestions(predictions) {
      box.innerHTML = "";
      if (!predictions || predictions.length === 0) {
        box.style.display = "none";
        return;
      }
      predictions.forEach(function (p) {
        var option = document.createElement("option");
        option.className = "places-suggestion-item";
        option.value = p.description || "";
        var mainText = p.structured_formatting && p.structured_formatting.main_text;
        var secondaryText = p.structured_formatting && p.structured_formatting.secondary_text;
        var label = p.description || ((mainText || "") + (secondaryText ? ", " + secondaryText : "")) || "";
        option.textContent = label;
        option.dataset.place = JSON.stringify(p);
        box.appendChild(option);
      });
      var rect = input.getBoundingClientRect();
      box.style.left = window.pageXOffset + rect.left + "px";
      box.style.top = window.pageYOffset + rect.bottom + "px";
      box.style.width = rect.width + "px";
      box.style.display = "block";
    }

    var onInput = debounce(async function () {
      var query = input.value.trim();
      if (!query) {
        box.style.display = "none";
        delete input.dataset.place;
        return;
      }
      try {
        var predictions = await fetchAutocompleteSuggestions(query);
        renderSuggestions(predictions);
      } catch (err) {
        console.error("Autocomplete error:", err);
        box.style.display = "none";
      }
    }, 700);

    input.addEventListener("input", onInput);
    input.addEventListener("focus", onInput);

    box.addEventListener("change", function () {
      var selected = box.selectedOptions[0];
      if (!selected) return;
      var place = selected.dataset.place ? JSON.parse(selected.dataset.place) : null;
      var value = selected.value || selected.textContent || "";
      input.value = value;
      if (place) input.dataset.place = JSON.stringify(place);
      box.style.display = "none";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    document.addEventListener("click", function (evt) {
      if (evt.target !== input && !box.contains(evt.target)) box.style.display = "none";
    });
  }

  function initMobileTimePicker(cfg) {
    var trigger = document.getElementById(cfg.triggerId);
    var hourCol = document.getElementById(cfg.hourColId);
    var minuteCol = document.getElementById(cfg.minuteColId);
    var hiddenInput = document.getElementById(cfg.hiddenId);
    var display = document.getElementById(cfg.displayId);
    var dropdown = document.getElementById(cfg.dropdownId);
    if (!trigger || !hourCol || !minuteCol || !hiddenInput || !display || !dropdown) return;

    var selectedHour = null;
    var selectedMinute = null;
    var highlight = document.createElement("div");
    highlight.className = "ant-time-picker-highlight";
    dropdown.appendChild(highlight);

    for (var h = 0; h < 24; h++) {
      var hv = String(h).padStart(2, "0");
      var hItem = document.createElement("div");
      hItem.className = "ant-time-picker-item";
      hItem.dataset.value = hv;
      hItem.textContent = hv;
      hItem.addEventListener("click", function (evt) {
        evt.stopPropagation();
        selectedHour = evt.currentTarget.dataset.value;
        markSelected();
        updateDisplay();
        emitChange();
        closeDropdown();
      });
      hourCol.appendChild(hItem);
    }
    for (var m = 0; m < 60; m++) {
      var mv = String(m).padStart(2, "0");
      var mItem = document.createElement("div");
      mItem.className = "ant-time-picker-item";
      mItem.dataset.value = mv;
      mItem.textContent = mv;
      mItem.addEventListener("click", function (evt) {
        evt.stopPropagation();
        selectedMinute = evt.currentTarget.dataset.value;
        markSelected();
        updateDisplay();
        emitChange();
        closeDropdown();
      });
      minuteCol.appendChild(mItem);
    }

    var defaultTime = new Date(Date.now() + 600 * 1000);
    selectedHour = String(defaultTime.getHours()).padStart(2, "0");
    selectedMinute = String(defaultTime.getMinutes()).padStart(2, "0");
    updateDisplay();
    emitChange();
    markSelected();

    var scrollTimer = null;

    function closestItem(col) {
      var rect = col.getBoundingClientRect();
      var center = rect.top + rect.height / 2;
      var best = null;
      var bestDist = Infinity;
      col.querySelectorAll(".ant-time-picker-item").forEach(function (item) {
        var itemRect = item.getBoundingClientRect();
        var itemCenter = itemRect.top + itemRect.height / 2;
        var dist = Math.abs(itemCenter - center);
        if (dist < bestDist) { bestDist = dist; best = item; }
      });
      return bestDist < 80 ? best : null;
    }

    function onColumnScroll(col, isHour) {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        var item = closestItem(col);
        if (!item) return;
        if (isHour) selectedHour = item.dataset.value;
        else selectedMinute = item.dataset.value;
        markSelected();
        updateDisplay();
      }, 100);
    }
    hourCol.addEventListener("scroll", function () { onColumnScroll(hourCol, true); });
    minuteCol.addEventListener("scroll", function () { onColumnScroll(minuteCol, false); });

    function positionHighlight() {
      var rect = dropdown.getBoundingClientRect();
      var centerY = rect.top + rect.height / 2;
      highlight.style.top = centerY - 18 + "px";
      highlight.style.left = rect.left + 4 + "px";
      highlight.style.width = rect.width - 8 + "px";
      highlight.style.height = "36px";
    }

    function updateDisplay() {
      if (selectedHour && selectedMinute) {
        display.textContent = selectedHour + ":" + selectedMinute;
        display.classList.add("has-value");
      } else {
        display.textContent = "Chọn giờ";
        display.classList.remove("has-value");
      }
    }

    function emitChange() {
      hiddenInput.value = selectedHour && selectedMinute ? selectedHour + ":" + selectedMinute : "";
      hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
      hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function markSelected() {
      hourCol.querySelectorAll(".ant-time-picker-item").forEach(function (item) {
        item.classList.toggle("selected", item.dataset.value === selectedHour);
      });
      minuteCol.querySelectorAll(".ant-time-picker-item").forEach(function (item) {
        item.classList.toggle("selected", item.dataset.value === selectedMinute);
      });
    }

    function positionDropdown() {
      var rect = trigger.getBoundingClientRect();
      dropdown.style.top = rect.bottom + 4 + "px";
      dropdown.style.left = rect.left + "px";
      dropdown.style.width = rect.width + "px";
      dropdown.style.position = "fixed";
    }

    function onReposition() { positionDropdown(); positionHighlight(); }

    function openDropdown() {
      if (dropdown.parentElement !== document.body) document.body.appendChild(dropdown);
      positionDropdown();
      dropdown.classList.add("open");
      positionHighlight();
      hourCol.addEventListener("scroll", positionHighlight);
      minuteCol.addEventListener("scroll", positionHighlight);
      window.addEventListener("scroll", onReposition, true);
      window.addEventListener("resize", onReposition);
      requestAnimationFrame(function () {
        var hSel = hourCol.querySelector(".selected");
        var mSel = minuteCol.querySelector(".selected");
        if (hSel) hSel.scrollIntoView({ block: "center", behavior: "auto" });
        if (mSel) mSel.scrollIntoView({ block: "center", behavior: "auto" });
      });
    }

    function closeDropdown() {
      dropdown.classList.remove("open");
      hourCol.removeEventListener("scroll", positionHighlight);
      minuteCol.removeEventListener("scroll", positionHighlight);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    }

    trigger.addEventListener("click", function (evt) {
      evt.stopPropagation();
      if (dropdown.classList.contains("open")) closeDropdown();
      else openDropdown();
    });
    document.addEventListener("click", function (evt) {
      var picker = document.getElementById(cfg.pickerId);
      if (picker && !picker.contains(evt.target)) closeDropdown();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var pickupSelectsMobile = document.getElementById("pickupSelectsMobile");
    var destinationSelectsMobile = document.getElementById("destinationSelectsMobile");
    if (pickupSelectsMobile) {
      pickupSelectsMobile.style.display = "none";
      pickupSelectsMobile.querySelectorAll("select").forEach(function (s) { s.disabled = true; });
    }
    if (destinationSelectsMobile) {
      destinationSelectsMobile.style.display = "none";
      destinationSelectsMobile.querySelectorAll("select").forEach(function (s) { s.disabled = true; });
    }

    attachAutocomplete("pickupAddressMobile");
    attachAutocomplete("destinationAddressMobile");

    var tripModeTabsMobile = document.getElementById("tripModeTabsMobile");
    if (tripModeTabsMobile) {
      tripModeTabsMobile.addEventListener("click", function (evt) {
        var btn = evt.target.closest("button.trip-mode");
        if (!btn) return;
        tripModeTabsMobile.querySelectorAll(".trip-mode").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        bookingMode = btn.dataset.mode || "airport";
        applyBookingMode(bookingMode, true);
      });
    }
    applyBookingMode(bookingMode, true);

    var swapBtnMobile = document.getElementById("swapBtnMobile");
    if (swapBtnMobile) swapBtnMobile.addEventListener("click", function () { handleMobileSwap(); });

    populateVehicleTypeSelects();
    loadAirportData();

    initMobileTimePicker({
      pickerId: "timeMobilePicker",
      triggerId: "timeMobileTrigger",
      hourColId: "timeMobileHourCol",
      minuteColId: "timeMobileMinuteCol",
      hiddenId: "timeMobile",
      displayId: "timeMobileDisplay",
      dropdownId: "timeMobileDropdown"
    });

    var dateMobileInput = document.getElementById("dateMobile");
    if (dateMobileInput) {
      dateMobileInput.setAttribute("min", formatDateToInputValue(new Date()));
      dateMobileInput.value = getFutureDepartureDateTime().date;
    }
  });

  var mobileBookingForm = document.getElementById("mobileBookingForm");
  if (mobileBookingForm) {
    mobileBookingForm.addEventListener("submit", async function (evt) {
      evt.preventDefault();
      var pickupInput = document.getElementById("pickupAddressMobile");
      var destInput = document.getElementById("destinationAddressMobile");
      var pickupAddress = pickupInput.value.trim();
      var destAddress = destInput.value.trim();
      var dateVal = document.getElementById("dateMobile").value;
      var timeVal = document.getElementById("timeMobile").value;
      var roundTrip = document.getElementById("roundTripMobile").checked;
      var airport = getSelectedAirport(["pickupAirportMobileSelect", "destinationAirportMobileSelect"]);

      if (!validateDepartureDateTime(dateVal, timeVal)) return;
      if (bookingMode === "airport" && !airport.airportId) {
        alert("Vui lòng chọn sân bay!");
        return;
      }
      if (bookingMode === "longDistance") {
        if (!pickupAddress || !destAddress) {
          alert("Vui lòng nhập đầy đủ điểm đi và điểm đến!");
          return;
        }
      } else {
        if (!isFromAirportMobile && !pickupAddress) {
          alert("Vui lòng nhập địa chỉ điểm đi!");
          return;
        }
        if (isFromAirportMobile && !destAddress) {
          alert("Vui lòng nhập địa chỉ điểm đến!");
          return;
        }
      }

      // Same validation as the live site, up to this point. The real price-check
      // API call + #priceModal rendering is intentionally not duplicated — see the
      // file header. This placeholder only proves the form data is valid.
      console.log("[xvsb-clone] Form hợp lệ, dữ liệu:", {
        pickupAddress: pickupAddress,
        destAddress: destAddress,
        date: dateVal,
        time: timeVal,
        vehicleType: getSelectedVehicleType(true),
        roundTrip: roundTrip,
        bookingMode: bookingMode,
        airport: airport
      });
      alert("[Bản test] Form hợp lệ — phần gọi API tính giá thật không được sao chép vì không liên quan tới lỗi vỡ layout đang kiểm tra.");
    });
  }
})();
