/*
 * XEVIPSANBAY.COM ORIGINAL MOBILE BOOKING FORM - JS behavior (for real-device overflow testing)
 * Source: https://xevipsanbay.com/script.min.js?v=20260710-video-fs
 * Fetched: 2026-08-12
 *
 * UPDATE: the address-autocomplete suggestion box and the time picker used to be this
 * file's own reimplementation (a native <select> overlay appended to <body> for
 * suggestions, and a hand-rolled scroll picker). On real Android hardware the block
 * below still overflowed while the site's own production form (same page, above this
 * one) did not — and both forms hit the exact same CORS-restricted backend for address
 * suggestions (see xevip-api.js), so it isn't a "real API works here, not there" story.
 * Rather than guess further, this now calls the PRODUCTION form's own, already-hardened
 * code directly: window.setupTimePicker (main.js) and the XevipAddressAutocomplete module
 * (xevip-address-autocomplete.js) — the same functions running the top form. The two
 * mobile address inputs got the `.place-autocomplete-input` class + a sibling
 * `<ul class="address-suggestions">` in the HTML so that shared module's own
 * querySelectorAll('.place-autocomplete-input') picks them up automatically; the time
 * inputs got `.ant-time-picker-hour` / `.ant-time-picker-minute` / `.input-trip-time` /
 * `.input-trip-date` alongside their existing ids/classes for the same reason. Only the
 * trip-mode-tab switching, pickup/destination swap, and vehicle-type population below
 * are still this file's own — they don't share any markup shape with the top form (row-
 * swap vs. inline-field-mode toggle), so reusing main.js's version for those would mean
 * rebuilding this form's HTML to match the top one, which is a separate, bigger change.
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

  function isValid24HourTime(v) {
    if (!/^\d{2}:\d{2}$/.test(String(v || ""))) return false;
    var parts = v.split(":");
    var h = Number(parts[0]);
    var m = Number(parts[1]);
    return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
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

    // Selected-address bookkeeping now goes through the shared
    // XevipAddressAutocomplete module (used by the top form's own swap
    // logic too) instead of a home-grown dataset.place convention.
    var addrApi = window.XevipAddressAutocomplete;
    if (isFromAirportMobile) {
      if (pickupAirportSelect && destAirportSelect) {
        destAirportSelect.value = pickupAirportSelect.value;
        syncAirportSelectUi(destAirportSelect);
      }
      var destAddr = addrApi && addrApi.getSelectedAddress(destInput);
      pickupInput.value = destInput.value || "";
      if (addrApi) addrApi.setSelectedAddress(pickupInput, destAddr);
      destInput.value = "";
      if (addrApi) addrApi.clearSelectedAddress(destInput);
      setMobilePickupFieldMode(false);
      setMobileDestinationFieldMode(true);
      isFromAirportMobile = false;
    } else {
      if (pickupAirportSelect && destAirportSelect) {
        pickupAirportSelect.value = destAirportSelect.value;
        syncAirportSelectUi(pickupAirportSelect);
      }
      var pickupAddr = addrApi && addrApi.getSelectedAddress(pickupInput);
      destInput.value = pickupInput.value || "";
      if (addrApi) addrApi.setSelectedAddress(destInput, pickupAddr);
      pickupInput.value = "";
      if (addrApi) addrApi.clearSelectedAddress(pickupInput);
      setMobilePickupFieldMode(true);
      setMobileDestinationFieldMode(false);
      isFromAirportMobile = true;
    }
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

    // Address autocomplete for #pickupAddressMobile/#destinationAddressMobile is wired
    // automatically by xevip-address-autocomplete.js's own DOMContentLoaded handler
    // (it queries every .place-autocomplete-input on the page, ours included, and
    // renders into the sibling <ul class="address-suggestions"> already in the HTML)
    // — nothing to call here.

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

    // Time picker: same window.setupTimePicker(widget) main.js uses for the top form's
    // own .ant-time-picker, pointed at this form instead of writing a second one here.
    // (main.js's initDateDefault() already set #dateMobile's min/value via its new
    // .input-trip-date class, so there's nothing left to do for the date field either.)
    var mobileBookingFormEl = document.getElementById("mobileBookingForm");
    if (mobileBookingFormEl && typeof window.setupTimePicker === "function") {
      window.setupTimePicker(mobileBookingFormEl);
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
