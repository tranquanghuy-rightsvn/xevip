/*
 * Gợi ý địa chỉ cho các ô "Điểm Đi"/"Điểm Đến" dạng nhập tự do, dùng
 * XevipApi.fetchAddressSuggestions (GET /v1/goong-map/autocomplete thật).
 *
 * QUAN TRỌNG (theo public-trip-registration-api.pdf mục 3): không được chỉ
 * gửi chuỗi description vào các field address/fromAddressBooking/
 * toAddressBooking — phải gửi nguyên object kết quả autocomplete. Vì vậy
 * module này lưu lại toàn bộ object đã chọn (không chỉ set input.value),
 * qua getSelectedAddress(input). Nếu người dùng gõ lại sau khi đã chọn,
 * object cũ bị hủy — main.js phải bắt buộc chọn lại từ dropdown trước khi
 * gọi check-prices/đăng ký.
 */
(function () {
  "use strict";

  var selectedAddressByInput = new WeakMap();

  function getSelectedAddress(input) {
    return (input && selectedAddressByInput.get(input)) || null;
  }

  function clearSelectedAddress(input) {
    if (input) selectedAddressByInput.delete(input);
  }

  function setSelectedAddress(input, address) {
    if (!input) return;
    if (address) selectedAddressByInput.set(input, address);
    else selectedAddressByInput.delete(input);
  }

  function attachAddressAutocomplete(input, list) {
    if (!input || !list) return;

    var activeIndex = -1;
    var currentItems = [];
    var debounceTimer = null;
    var requestSeq = 0;

    function closeList() {
      list.hidden = true;
      list.innerHTML = "";
      activeIndex = -1;
      currentItems = [];
    }

    function renderList(items) {
      currentItems = items;
      activeIndex = -1;
      if (!items.length) {
        closeList();
        return;
      }
      list.innerHTML = items
        .map(function (item, i) {
          var fmt = item.structured_formatting || {};
          var main = fmt.main_text || item.description || "";
          var rest = fmt.secondary_text || "";
          return (
            '<li class="address-suggestion-item" data-index="' +
            i +
            '"><strong>' +
            main +
            "</strong>" +
            (rest ? ", " + rest : "") +
            "</li>"
          );
        })
        .join("");
      list.hidden = false;
      clampListToViewport();
    }

    // CSS (max-width:100%, overflow-x:hidden, word-break:break-all) is supposed to
    // keep this dropdown inside the screen on its own, but real Android browsers
    // have been seen to still let a long suggestion push the page wider than the
    // viewport while the on-screen keyboard is open. Re-measure right after
    // rendering and shrink/close as a hard backstop so this can never leave the
    // page stuck wider than the screen — CSS is the primary defense, this is
    // just insurance for whatever CSS alone didn't catch on that device.
    function clampListToViewport() {
      requestAnimationFrame(function () {
        if (list.hidden) return;
        var rect = list.getBoundingClientRect();
        var viewportWidth = document.documentElement.clientWidth;
        var overflowRight = rect.right - viewportWidth;
        if (overflowRight > 0) {
          list.style.maxWidth = Math.max(0, rect.width - overflowRight - 4) + "px";
        }
        if (document.documentElement.scrollWidth > viewportWidth) {
          // Still wider than the screen even after shrinking — something else in
          // this dropdown escaped the clamp. Close it rather than leave the page
          // stuck overflowed; the user can keep typing to try again.
          closeList();
        }
      });
    }

    function selectItem(item) {
      input.value = item.description || "";
      // Handler mousedown bên dưới gọi preventDefault() nên focus VẪN nằm ở
      // input này. Vừa gán 1 địa chỉ dài ("Bến xe Nước Ngầm, Phường Hoàng
      // Liệt, ...") thì con trỏ nhảy về CUỐI đoạn text, nằm ngoài khung input
      // → Android Chrome tự cuộn ngang mọi ancestor cuộn được để "lộ" con trỏ,
      // làm cả trang bị đẩy lệch. Đưa con trỏ về đầu và reset cuộn nội bộ của
      // input ngay tại đây để không còn gì nằm ngoài khung cần cuộn tới.
      // (xevipsanbay không gặp vì lúc họ gán giá trị, focus đang ở thẻ <select>
      // gợi ý chứ không ở ô text, nên ô text không có con trỏ.)
      try {
        input.setSelectionRange(0, 0);
      } catch (err) {
        /* setSelectionRange không áp dụng cho vài loại input — bỏ qua */
      }
      input.scrollLeft = 0;
      selectedAddressByInput.set(input, item);
      closeList();
    }

    function setActive(index) {
      var children = list.querySelectorAll(".address-suggestion-item");
      children.forEach(function (el) {
        el.classList.remove("active");
      });
      if (index >= 0 && children[index]) {
        children[index].classList.add("active");
        children[index].scrollIntoView({ block: "nearest" });
      }
      activeIndex = index;
    }

    input.addEventListener("input", function () {
      clearSelectedAddress(input);
      var query = input.value;
      var seq = ++requestSeq;
      clearTimeout(debounceTimer);
      if (!query.trim()) {
        closeList();
        return;
      }
      debounceTimer = setTimeout(function () {
        XevipApi.fetchAddressSuggestions(query).then(function (items) {
          if (seq === requestSeq) renderList(items);
        });
      }, 250);
    });

    input.addEventListener("keydown", function (e) {
      if (list.hidden || !currentItems.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((activeIndex + 1) % currentItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((activeIndex - 1 + currentItems.length) % currentItems.length);
      } else if (e.key === "Enter") {
        if (activeIndex >= 0) {
          e.preventDefault();
          selectItem(currentItems[activeIndex]);
        }
      } else if (e.key === "Escape") {
        closeList();
      }
    });

    list.addEventListener("mousedown", function (e) {
      var item = e.target.closest(".address-suggestion-item");
      if (!item) return;
      e.preventDefault();
      var idx = Number(item.dataset.index);
      if (currentItems[idx]) selectItem(currentItems[idx]);
    });

    document.addEventListener("click", function (e) {
      if (e.target !== input && !list.contains(e.target)) closeList();
    });
  }

  function initAddressAutocomplete() {
    document.querySelectorAll(".place-autocomplete-input").forEach(function (input) {
      var list = input.parentElement.querySelector(".address-suggestions");
      attachAddressAutocomplete(input, list);
    });
  }

  window.XevipAddressAutocomplete = {
    getSelectedAddress: getSelectedAddress,
    clearSelectedAddress: clearSelectedAddress,
    setSelectedAddress: setSelectedAddress,
    init: initAddressAutocomplete,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAddressAutocomplete);
  } else {
    initAddressAutocomplete();
  }
})();
