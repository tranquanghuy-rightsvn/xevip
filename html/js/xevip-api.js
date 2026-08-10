/*
 * Client gọi thẳng backend thật api.xevipsanbay.com theo đúng tài liệu
 * public-trip-registration-api.pdf (Goong Maps autocomplete, danh sách sân
 * bay, kiểm tra giá, đăng ký chuyến). Backend giới hạn CORS theo đúng origin
 * https://xevipsanbay.com nên các request ở đây CHỈ thành công khi trang
 * được deploy đúng domain đó — chạy ở localhost/domain khác sẽ bị chặn bởi
 * trình duyệt (browser tự chặn preflight, không phải lỗi code).
 */
(function () {
  "use strict";

  var API_BASE = "https://api.xevipsanbay.com";

  function buildQuery(params) {
    return Object.keys(params)
      .filter(function (k) {
        return params[k] !== undefined && params[k] !== null && params[k] !== "";
      })
      .map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
      })
      .join("&");
  }

  // GET /v1/goong-map/autocomplete — trả nguyên mảng predictions (object đầy
  // đủ, không chỉ description) để dùng thẳng làm address/fromAddressBooking/
  // toAddressBooking khi kiểm tra giá / đăng ký chuyến, đúng yêu cầu tài liệu.
  async function fetchAddressSuggestions(input) {
    if (!input || !input.trim()) return [];
    try {
      var qs = buildQuery({ input: input, has_deprecated_administrative_unit: true });
      var res = await fetch(API_BASE + "/v1/goong-map/autocomplete?" + qs);
      var json = await res.json();
      if (!json.success) {
        console.error("[xevip-api] Lỗi tìm địa chỉ:", json);
        return [];
      }
      return (json.data && json.data.predictions) || [];
    } catch (err) {
      console.error("[xevip-api] Không gọi được goong-map/autocomplete:", err);
      return [];
    }
  }

  // GET /v1/airports/all — cache lại vì danh sách không đổi trong 1 phiên.
  var airportsPromise = null;
  function fetchAirports() {
    if (airportsPromise) return airportsPromise;
    airportsPromise = fetch(API_BASE + "/v1/airports/all")
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        return (json.success && json.data) || [];
      })
      .catch(function (err) {
        console.error("[xevip-api] Không tải được danh sách sân bay:", err);
        return [];
      });
    return airportsPromise;
  }

  // POST /v1/trip-registers/check-prices
  async function checkPrices(payload) {
    try {
      var res = await fetch(API_BASE + "/v1/trip-registers/check-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 429) {
        return { data: null, rateLimited: true, error: null };
      }
      var json = await res.json();
      if (!json.success) {
        // 404 (không có bảng giá phù hợp) hoặc 400 đều rơi vào đây — theo
        // checklist tài liệu: không tự suy đoán giá, chuyển sang "liên hệ".
        console.error("[xevip-api] check-prices lỗi:", json);
        return { data: null, rateLimited: false, error: json };
      }
      return { data: json.data, rateLimited: false, error: null };
    } catch (err) {
      console.error("[xevip-api] Không gọi được check-prices:", err);
      return { data: null, rateLimited: false, error: err };
    }
  }

  // POST /v1/trip-registers
  async function submitTripRegister(payload) {
    try {
      var res = await fetch(API_BASE + "/v1/trip-registers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      var json = await res.json();
      if (!res.ok || !json.success) {
        console.error("[xevip-api] Đăng ký chuyến lỗi:", json);
        return { success: false, data: null, error: json };
      }
      return { success: true, data: json.data, error: null };
    } catch (err) {
      console.error("[xevip-api] Không gửi được đăng ký chuyến:", err);
      return { success: false, data: null, error: err };
    }
  }

  window.XevipApi = {
    fetchAddressSuggestions: fetchAddressSuggestions,
    fetchAirports: fetchAirports,
    checkPrices: checkPrices,
    submitTripRegister: submitTripRegister,
  };
})();
