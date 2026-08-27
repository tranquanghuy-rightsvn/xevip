document.addEventListener('DOMContentLoaded', () => {
  initLogoEntrance();
  initMobileNav();
  initBookingWidget();
  initFareTabs();
  initClientsCarousel();
  initScrollTop();
  initDateDefault();
  initPriceModalSubmit();
  populateAirportSelects();
  initPricingTabs();
  initVideoShowcase();
  initContactForm();
  initHorizontalOverflowGuard();
});

/* ---------------------------------------------------------------- */
// Lưới an toàn cuối: bản trước của hàm này CHỈ kiểm tra window.scrollX và gọi
// window.scrollTo — vô dụng đúng trong tình huống đang lỗi, vì phần tử bị cuộn
// lệch là chính <body> (do overflow-x:hidden khiến nó thành scroll container):
// khi body cuộn, window.scrollX vẫn bằng 0 và window.scrollTo không chạm tới
// nó. Nay reset trực tiếp scrollLeft trên documentElement + body. Sự kiện
// 'scroll' của phần tử không bubble nên phải bắt ở pha capture mới nhận được
// scroll phát ra từ body.
// Chỉ là phòng tuyến cuối: fix chính là overflow-x:clip trong style.css và
// việc đưa con trỏ về đầu ô input trong xevip-address-autocomplete.js.
function initHorizontalOverflowGuard() {
  function snapBack() {
    if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
    if (document.documentElement.scrollLeft !== 0) document.documentElement.scrollLeft = 0;
    if (document.body.scrollLeft !== 0) document.body.scrollLeft = 0;
  }
  document.addEventListener('scroll', snapBack, true);
  window.addEventListener('resize', snapBack);
  document.addEventListener('input', snapBack, true);
  document.addEventListener('focusin', snapBack, true);
  snapBack();
}

/* ---------------------------------------------------------------- */
function initLogoEntrance() {
  const icon = document.querySelector('.logo-icon');
  if (!icon) return;

  const currentX = () => {
    const t = getComputedStyle(icon).translate;
    if (!t || t === 'none') return 0;
    return parseFloat(t.split(' ')[0]) || 0;
  };

  const watchForBrake = () => {
    if (currentX() >= -20) {
      icon.classList.add('brake');
      setTimeout(() => icon.classList.remove('brake'), 220);
      return;
    }
    requestAnimationFrame(watchForBrake);
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      icon.classList.add('in');
      requestAnimationFrame(watchForBrake);
    });
  });
}

/* ---------------------------------------------------------------- */
function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const drawer = document.querySelector('.mobile-nav-drawer');
  if (!toggle || !drawer) return;
  const isOpen = () => drawer.classList.contains('open');
  const open = () => {
    drawer.classList.add('open');
    toggle.classList.add('is-active');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
  };
  const close = () => {
    drawer.classList.remove('open');
    toggle.classList.remove('is-active');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
    drawer.querySelectorAll('.drawer-item.open').forEach((item) => item.classList.remove('open'));
    drawer.querySelectorAll('.drawer-parent-link').forEach((link) => link.setAttribute('aria-expanded', 'false'));
  };
  toggle.addEventListener('click', () => (isOpen() ? close() : open()));
  drawer.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
  // Desktop: các link menu cha để href="#" chỉ để toggle submenu, không redirect
  document.querySelectorAll('.main-nav a[href="#"]').forEach((a) => {
    a.addEventListener('click', (e) => e.preventDefault());
  });
  // querySelectorAll thay vì querySelector đơn lẻ — hỗ trợ nhiều cấp
  // drawer-item lồng nhau (vd tầng 3 danh sách sân bay trong tầng 2 Dịch vụ).
  drawer.querySelectorAll('.drawer-parent-link').forEach((parentLink) => {
    const item = parentLink.closest('.drawer-item');
    parentLink.addEventListener('click', () => {
      const expanded = item.classList.toggle('open');
      parentLink.setAttribute('aria-expanded', String(expanded));
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) close();
  });
}

/* ---------------------------------------------------------------- */
function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

// Ngày Đi vẫn là input[type=date] gốc của trình duyệt — chỉ set min/value mặc
// định là hôm nay. Giờ Đi tự set giá trị mặc định riêng bên trong
// setupTimePicker() (đã đổi sang kiểu cuộn chọn, xem hàm đó).
function initDateDefault() {
  const dateInputs = document.querySelectorAll('.input-trip-date');
  if (!dateInputs.length) return;
  const now = new Date();
  const dateValue = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  dateInputs.forEach((i) => { i.min = dateValue; i.value = dateValue; });
}

// Ghép ngày (yyyy-mm-dd) + giờ (HH:mm) của widget thành chuỗi hiển thị dd/mm/yyyy HH:mm
function getTripDateTimeDisplay(widget) {
  const dateVal = widget.querySelector('.input-trip-date')?.value;
  const timeVal = widget.querySelector('.input-trip-time')?.value;
  if (!dateVal || !timeVal) return '';
  const [y, m, d] = dateVal.split('-');
  return `${d}/${m}/${y} ${timeVal}`;
}

// timeAt gửi API phải là ISO datetime có timezone (theo tài liệu) — giờ Việt
// Nam cố định +07:00, không có DST.
function getTripDateTimeIso(widget) {
  const dateVal = widget.querySelector('.input-trip-date')?.value;
  const timeVal = widget.querySelector('.input-trip-time')?.value;
  if (!dateVal || !timeVal) return '';
  return `${dateVal}T${timeVal}:00+07:00`;
}

/* ---------------------------------------------------------------- */
function initBookingWidget() {
  document.querySelectorAll('.booking-widget, .footer-booking').forEach(setupBookingWidget);
}

// Nạp danh sách sân bay thật từ GET /v1/airports/all vào mọi select sân bay
// trên trang (dùng chung 1 lần gọi API, XevipApi.fetchAirports() tự cache).
// value của option là airportId (UUID) thật — bắt buộc phải dùng đúng ID này
// khi gọi check-prices/trip-registers, không được tự chế.
async function populateAirportSelects() {
  const selects = document.querySelectorAll('.airport-select');
  if (!selects.length) return;
  const airports = await XevipApi.fetchAirports();
  if (!airports.length) {
    selects.forEach((sel) => {
      sel.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Không tải được danh sách sân bay';
      sel.appendChild(opt);
    });
    return;
  }
  selects.forEach((sel) => {
    sel.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Mời bạn chọn sân bay';
    placeholder.disabled = true;
    placeholder.selected = true;
    sel.appendChild(placeholder);
    airports.forEach((a) => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      sel.appendChild(opt);
    });
    sel.value = '';
    enhanceAirportSelect(sel);
  });
}

// Bỏ dấu tiếng Việt để so khớp gõ tìm không phân biệt dấu (vd. "noi bai"
// vẫn khớp "Nội Bài").
function normalizeForSearch(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

// Biến mỗi <select class="airport-select"> thành ô vừa gõ tìm vừa chọn từ
// danh sách sân bay: <select> gốc được giữ nguyên trong DOM (ẩn bằng
// opacity/pointer-events, không display:none) để toàn bộ logic hiện có
// (giá trị .value, .selectedOptions, required, hidden/disabled khi đảo
// chiều/đổi tab) không cần sửa gì — chỉ thêm lớp UI gõ-tìm phía trên.
function enhanceAirportSelect(select) {
  if (!select || select.dataset.enhanced) return;
  select.dataset.enhanced = '1';
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.classList.add('airport-select-native');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'airport-search-input';
  input.placeholder = 'Mời bạn chọn sân bay';
  input.autocomplete = 'off';

  const list = document.createElement('ul');
  list.className = 'airport-suggestions';
  list.hidden = true;

  select.insertAdjacentElement('afterend', list);
  select.insertAdjacentElement('afterend', input);

  const getOptions = () => Array.from(select.options).filter((o) => o.value);
  const selectedName = () => {
    const opt = getOptions().find((o) => o.value === select.value);
    return opt ? opt.textContent : '';
  };

  function renderList(filter) {
    const q = normalizeForSearch(filter || '');
    const opts = getOptions().filter((o) => !q || normalizeForSearch(o.textContent).includes(q));
    list.innerHTML = '';
    if (!opts.length) {
      const li = document.createElement('li');
      li.className = 'address-suggestion-item';
      li.textContent = 'Không tìm thấy sân bay phù hợp';
      list.appendChild(li);
    } else {
      opts.forEach((o) => {
        const li = document.createElement('li');
        li.className = 'address-suggestion-item';
        li.textContent = o.textContent;
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          select.value = o.value;
          select.setCustomValidity('');
          input.value = o.textContent;
          list.hidden = true;
        });
        list.appendChild(li);
      });
    }
    list.hidden = false;
  }

  input.addEventListener('focus', () => {
    input.select();
    renderList('');
  });
  input.addEventListener('input', () => {
    select.value = '';
    renderList(input.value);
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      list.hidden = true;
      if (!select.value) input.value = '';
    }, 150);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') list.hidden = true;
  });

  function syncVisibility() {
    input.hidden = select.hidden;
    input.disabled = select.disabled;
    if (select.hidden || select.disabled) list.hidden = true;
    if (!select.hidden && select.value) input.value = selectedName();
  }
  syncVisibility();
  new MutationObserver(syncVisibility).observe(select, { attributes: true, attributeFilter: ['hidden', 'disabled'] });
  // Cho phép code ngoài gán select.value rồi yêu cầu vẽ lại ô hiển thị (ô gõ-tìm
  // không tự biết giá trị vừa đổi vì <select> gốc không bắn 'change' khi gán bằng JS).
  select.addEventListener('xevip:sync', syncVisibility);
}

// ---------------- Nhận diện sân bay từ địa chỉ Google Maps ----------------
// Dùng cho tính năng "gõ điểm đi là sân bay -> tự đảo chiều" (xem setupBookingWidget).
//
// Tên sân bay lấy từ API /v1/airports/all, và dữ liệu thật khá lộn xộn: hoa/thường lẫn
// lộn ("Sân bay Cần Thơ" vs "sân bay vinh"), có cái không kèm chữ sân bay ("Chu Lai"),
// có cái thừa dấu cách ("sân bay phú quốc "), và vài cái gõ sai dấu ("pleku",
// "buôn ma thuật"). Vì vậy so khớp phải bỏ dấu, bỏ tiền tố, và có bảng tên thay thế cho
// mấy chỗ gõ sai — KHÔNG so khớp thẳng chuỗi.

// Địa chỉ phải chứa 1 trong các từ khoá này thì mới xét tiếp. Đây chính là quy tắc chủ dự
// án chốt: "có chữ sân bay trong tên".
const AIRPORT_ADDRESS_KEYWORDS = ['san bay', 'airport', 'cang hang khong'];

// Tên bị gõ sai trong dữ liệu API -> tên Google Maps thật sự dùng. Chỉ THÊM lựa chọn khớp,
// không thay thế, nên khi nào API sửa lại tên đúng thì cơ chế vẫn chạy bình thường.
const AIRPORT_NAME_ALIASES = {
  'pleku': ['pleiku'],
  'buon ma thuat': ['buon ma thuot'],
};

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "sân bay Nội Bài" -> "noi bai": bỏ dấu + bỏ mọi tiền tố chung, chỉ giữ phần tên riêng.
function airportCoreName(name) {
  return normalizeForSearch(String(name || ''))
    .replace(/\b(cang hang khong|san bay|quoc te|international|airport)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tìm <option> sân bay khớp với chuỗi địa chỉ Google Maps trả về.
 * Trả null nếu địa chỉ không phải sân bay, hoặc là sân bay nhưng không có trong danh sách
 * đang phục vụ (vd sân bay nước ngoài) - lúc đó KHÔNG đảo chiều, để nguyên cho người dùng. */
function findAirportOptionByAddress(select, addressText) {
  if (!select) return null;
  const addr = normalizeForSearch(String(addressText || '')).replace(/\s+/g, ' ');
  if (!AIRPORT_ADDRESS_KEYWORDS.some((k) => addr.includes(k))) return null;

  let best = null;
  Array.from(select.options).filter((o) => o.value).forEach((o) => {
    const core = airportCoreName(o.textContent);
    if (!core) return;
    const variants = [core].concat(AIRPORT_NAME_ALIASES[core] || []);
    // Khớp theo RANH GIỚI TỪ, không phải substring trần: "vinh" mà khớp kiểu substring thì
    // "Sân bay Nội Bài, Vĩnh Phúc" sẽ bị nhận nhầm thành sân bay Vinh.
    const hit = variants.some((v) => new RegExp('(^|[^a-z0-9])' + escapeRegExp(v) + '($|[^a-z0-9])').test(addr));
    // Nhiều tên cùng khớp thì lấy tên DÀI NHẤT (cụ thể nhất).
    if (hit && (!best || core.length > best.core.length)) best = { option: o, core: core };
  });
  return best ? best.option : null;
}

// Báo chưa chọn sân bay từ danh sách gợi ý, cùng cơ chế bubble validate
// native với reportAddressNotSelected ở trên.
function reportAirportNotSelected(bookingForm, select) {
  select.setCustomValidity('Vui lòng nhập và chọn sân bay từ danh sách gợi ý bên dưới ô này.');
  bookingForm.reportValidity();
  select.setCustomValidity('');
}

// Giờ đi và ngày đi cộng lại phải sau thời điểm hiện tại — báo lỗi qua
// setCustomValidity trên chính hidden input .input-trip-time để trình duyệt
// tự chặn submit và hiện bubble, giống getDepartureValidationMessage của
// xevipsanbay/html/index.html.
function validateDepartureNotPast(widget) {
  const dateInput = widget.querySelector('.input-trip-date');
  const timeInput = widget.querySelector('.input-trip-time');
  if (!dateInput || !timeInput || !dateInput.value || !timeInput.value) return;
  const dt = new Date(`${dateInput.value}T${timeInput.value}`);
  const invalid = Number.isNaN(dt.getTime()) || dt <= new Date();
  timeInput.setCustomValidity(invalid ? 'Ngày đi và giờ đi phải sau thời điểm hiện tại!' : '');
}

// Time picker kiểu Ant Design (cuộn chọn giờ/phút, click để chọn và tự đóng)
// — port 1:1 cơ chế chọn từ xevipsanbay/html/index.html. Chỉ khác là dùng
// class/querySelector theo widget thay vì id cố định để không đụng logic
// initBookingWidget áp cho nhiều widget hiện có.
function setupTimePicker(widget) {
  const picker = widget.querySelector('.ant-time-picker');
  if (!picker) return;
  const trigger = picker.querySelector('.ant-time-picker-trigger');
  const dropdown = picker.querySelector('.ant-time-picker-dropdown');
  const hourCol = picker.querySelector('.ant-time-picker-hour');
  const minuteCol = picker.querySelector('.ant-time-picker-minute');
  const hiddenInput = picker.querySelector('.input-trip-time');
  const display = trigger.querySelector('.ant-time-picker-value');
  if (!trigger || !dropdown || !hourCol || !minuteCol || !hiddenInput || !display) return;

  let hour = null;
  let minute = null;
  const highlight = document.createElement('div');
  highlight.className = 'ant-time-picker-highlight';
  dropdown.appendChild(highlight);

  for (let h = 0; h < 24; h++) {
    const v = pad(h);
    const item = document.createElement('div');
    item.className = 'ant-time-picker-item';
    item.dataset.value = v;
    item.textContent = v;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      hour = v;
      updateSelectedClasses();
      updateDisplay();
      commitValue();
      close();
    });
    hourCol.appendChild(item);
  }
  for (let m = 0; m < 60; m++) {
    const v = pad(m);
    const item = document.createElement('div');
    item.className = 'ant-time-picker-item';
    item.dataset.value = v;
    item.textContent = v;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      minute = v;
      updateSelectedClasses();
      updateDisplay();
      commitValue();
      close();
    });
    minuteCol.appendChild(item);
  }

  const defaultTime = new Date(Date.now() + 10 * 60 * 1000);
  hour = pad(defaultTime.getHours());
  minute = pad(defaultTime.getMinutes());
  updateDisplay();
  commitValue();
  updateSelectedClasses();

  function updateDisplay() {
    if (hour && minute) {
      display.textContent = `${hour}:${minute}`;
      display.classList.add('has-value');
    } else {
      display.textContent = 'Chọn giờ';
      display.classList.remove('has-value');
    }
  }

  function commitValue() {
    hiddenInput.value = hour && minute ? `${hour}:${minute}` : '';
    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function updateSelectedClasses() {
    hourCol.querySelectorAll('.ant-time-picker-item').forEach((el) => {
      el.classList.toggle('selected', el.dataset.value === hour);
    });
    minuteCol.querySelectorAll('.ant-time-picker-item').forEach((el) => {
      el.classList.toggle('selected', el.dataset.value === minute);
    });
  }

  function nearestItemToCenter(col) {
    const rect = col.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    let closest = null;
    let minDist = Infinity;
    col.querySelectorAll('.ant-time-picker-item').forEach((el) => {
      const r = el.getBoundingClientRect();
      const dist = Math.abs(r.top + r.height / 2 - centerY);
      if (dist < minDist) { minDist = dist; closest = el; }
    });
    return minDist < 80 ? closest : null;
  }

  let scrollTimer = null;
  function handleColumnScroll(col, isHour) {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const item = nearestItemToCenter(col);
      if (!item) return;
      if (isHour) hour = item.dataset.value; else minute = item.dataset.value;
      updateSelectedClasses();
      updateDisplay();
      commitValue();
    }, 100);
  }
  hourCol.addEventListener('scroll', () => handleColumnScroll(hourCol, true));
  minuteCol.addEventListener('scroll', () => handleColumnScroll(minuteCol, false));

  function positionHighlight() {
    const rect = dropdown.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    highlight.style.top = `${centerY - 18}px`;
    highlight.style.left = `${rect.left + 4}px`;
    highlight.style.width = `${rect.width - 8}px`;
    highlight.style.height = '36px';
  }
  function positionDropdown() {
    const rect = trigger.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;
    dropdown.style.position = 'fixed';
  }
  const onWindowScrollOrResize = () => { positionDropdown(); positionHighlight(); };

  function open() {
    if (dropdown.parentElement !== document.body) document.body.appendChild(dropdown);
    positionDropdown();
    dropdown.classList.add('open');
    trigger.classList.add('open');
    positionHighlight();
    hourCol.addEventListener('scroll', positionHighlight);
    minuteCol.addEventListener('scroll', positionHighlight);
    window.addEventListener('scroll', onWindowScrollOrResize, true);
    window.addEventListener('resize', onWindowScrollOrResize);
    requestAnimationFrame(() => {
      const selHour = hourCol.querySelector('.selected');
      const selMinute = minuteCol.querySelector('.selected');
      selHour?.scrollIntoView({ block: 'center', behavior: 'auto' });
      selMinute?.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
  }
  function close() {
    dropdown.classList.remove('open');
    trigger.classList.remove('open');
    hourCol.removeEventListener('scroll', positionHighlight);
    minuteCol.removeEventListener('scroll', positionHighlight);
    window.removeEventListener('scroll', onWindowScrollOrResize, true);
    window.removeEventListener('resize', onWindowScrollOrResize);
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.contains('open') ? close() : open();
  });
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dropdown.classList.contains('open') ? close() : open(); }
    if (e.key === 'Escape') close();
  });
  document.addEventListener('click', (e) => {
    if (!picker.contains(e.target) && !dropdown.contains(e.target)) close();
  });

  hiddenInput.addEventListener('change', () => validateDepartureNotPast(widget));
  widget.querySelector('.input-trip-date')?.addEventListener('change', () => validateDepartureNotPast(widget));
}

function formatVnd(amount) {
  return amount.toLocaleString('vi-VN') + 'đ';
}

const RATE_LIMIT_TITLE = 'Hệ thống đang bận, vui lòng thử kiểm tra giá lại sau ít phút.';
const UNAVAILABLE_TITLE_HTML = 'Chưa có bảng giá cho khu vực này - Liên hệ : <a href="tel:19009144">1900 9144</a>';
const UNAVAILABLE_BODY = 'Vui lòng để lại thông tin, chúng tôi sẽ liên hệ báo giá sớm nhất.';

function updateModalPricing(modal, carTypeLabel, price, rateLimited) {
  const priceBox = modal.querySelector('.confirm-price-box');
  const cartypeEl = modal.querySelector('.confirm-price-cartype');
  const amountEl = modal.querySelector('.confirm-price-amount');
  const notice = modal.querySelector('.price-notice');
  const noticeTitle = modal.querySelector('.price-notice-title-text');
  const noticeBody = modal.querySelector('.price-notice-body');

  if (cartypeEl) cartypeEl.textContent = carTypeLabel || 'Chưa chọn loại xe';
  if (amountEl) amountEl.textContent = price ? formatVnd(price) : '';
  // Không có giá thì ẩn luôn ô giá: lúc đó nó chỉ còn trơ tên loại xe, mà thông
  // tin này đã có ở dòng "Loại:" trong .confirm-summary phía trên.
  if (priceBox) priceBox.hidden = !price;
  if (notice && noticeTitle && noticeBody) {
    if (rateLimited) {
      noticeTitle.textContent = RATE_LIMIT_TITLE;
      noticeBody.textContent = '';
    } else {
      noticeTitle.innerHTML = UNAVAILABLE_TITLE_HTML;
      noticeBody.textContent = UNAVAILABLE_BODY;
    }
    notice.hidden = !carTypeLabel || !!price;
  }
}

function populateConfirmSummary(widget, modal, carTypeLabel, endValue, startValue) {
  const dateValue = getTripDateTimeDisplay(widget);
  const isRoundtrip = widget.querySelector('.roundtrip-checkbox')?.checked;
  const tripType = isRoundtrip ? 'Chuyến 2 chiều' : 'Chuyến 1 chiều';

  const startEl = modal.querySelector('.confirm-start');
  const endEl = modal.querySelector('.confirm-end');
  const timeEl = modal.querySelector('.confirm-time');
  const typeEl = modal.querySelector('.confirm-cartype');

  if (startEl) startEl.textContent = startValue || 'Chưa chọn';
  if (endEl) endEl.textContent = endValue || 'Chưa chọn';
  if (timeEl) timeEl.textContent = dateValue || 'Chưa chọn';
  if (typeEl) typeEl.textContent = carTypeLabel ? `${carTypeLabel} | ${tripType}` : tripType;
}

// Trạng thái chuyến đi đang chờ xác nhận trong #priceModal — được nạp khi bấm
// "KIỂM TRA GIÁ" trên booking-widget (kết quả thật từ check-prices), và đọc
// lại khi bấm "Đặt xe với giá này" trong modal để gọi POST /v1/trip-registers
// thật (xem initPriceModalSubmit).
let pendingTrip = null;

// Báo field chưa chọn đúng gợi ý (bắt buộc theo tài liệu: không được gửi
// chuỗi text, phải gửi object autocomplete đã chọn) bằng chính cơ chế
// validate native của form, tái dùng bubble có sẵn của trình duyệt.
function reportAddressNotSelected(bookingForm, input) {
  input.setCustomValidity('Vui lòng chọn địa chỉ từ danh sách gợi ý bên dưới ô này.');
  bookingForm.reportValidity();
  input.setCustomValidity('');
}

function setupBookingWidget(widget) {
  setupTimePicker(widget);
  const airportTab = widget.querySelector('.tab-airport');
  const roadTab = widget.querySelector('.tab-road');
  const startAirport = widget.querySelector('.start-point-airport');
  const startRoad = widget.querySelector('.start-point-road');
  const destAirport = widget.querySelector('.destination-point-airport');
  const destRoad = widget.querySelector('.destination-point-road');
  const locationInput = widget.querySelector('.input-location-search');
  const startInput = widget.querySelector('.input-start-point');
  const startSelect = widget.querySelector('.start-point-select');
  const endSelect = widget.querySelector('.end-point-select');
  const endInput = widget.querySelector('.end-point-input');
  const destAddressInput = widget.querySelector('.destination-address-input');
  const swapBtn = widget.querySelector('.swap-btn');

  // Tab "Đi sân bay" phủ cả 2 chiều (đón khách TẠI sân bay hoặc trả khách TẠI
  // sân bay) nên Điểm Đi/Điểm Đến mỗi bên đều có 2 kiểu field khả dụng: địa
  // chỉ tự do và select sân bay. "Đảo chiều" chỉ đổi field nào đang hiện ở
  // bên nào; giá trị người dùng đã nhập không tự chuyển sang field kia.
  // Đúng theo tài liệu: !swapped = FARE_WELL (địa chỉ khách → sân bay),
  // swapped = PICK_UP (sân bay → địa chỉ khách).
  let airportSwapped = false;

  function applyAirportSwap() {
    const pickupShowsSelect = airportSwapped;
    if (locationInput) { locationInput.hidden = pickupShowsSelect; locationInput.disabled = pickupShowsSelect; }
    if (startSelect) { startSelect.hidden = !pickupShowsSelect; startSelect.disabled = !pickupShowsSelect; }
    if (endSelect) { endSelect.hidden = pickupShowsSelect; endSelect.disabled = pickupShowsSelect; }
    if (destAddressInput) { destAddressInput.hidden = !pickupShowsSelect; destAddressInput.disabled = !pickupShowsSelect; }
  }

  // Ẩn hàng .form-row[hidden] không tự loại field bên trong khỏi validate
  // required của trình duyệt (một field required nằm trong ancestor hidden
  // vẫn có thể chặn submit) — nên phải tắt luôn bằng `disabled` trên chính
  // field không thuộc tab/trạng thái đang active, disabled thì chắc chắn
  // được bỏ qua.
  if (airportTab && roadTab) {
    airportTab.addEventListener('click', () => {
      airportTab.classList.add('active');
      roadTab.classList.remove('active');
      if (startInput) { startInput.value = ''; startInput.disabled = true; }
      XevipAddressAutocomplete.clearSelectedAddress(startInput);
      airportSwapped = false;
      applyAirportSwap();
      if (startAirport) startAirport.hidden = false;
      if (startRoad) startRoad.hidden = true;
      if (endInput) endInput.disabled = true;
      if (destAirport) destAirport.hidden = false;
      if (destRoad) destRoad.hidden = true;
    });
    roadTab.addEventListener('click', () => {
      roadTab.classList.add('active');
      airportTab.classList.remove('active');
      if (endInput) { endInput.value = ''; endInput.disabled = false; }
      XevipAddressAutocomplete.clearSelectedAddress(endInput);
      if (locationInput) locationInput.disabled = true;
      if (startSelect) startSelect.disabled = true;
      if (endSelect) endSelect.disabled = true;
      if (destAddressInput) destAddressInput.disabled = true;
      if (startInput) startInput.disabled = false;
      if (startAirport) startAirport.hidden = true;
      if (startRoad) startRoad.hidden = false;
      if (destAirport) destAirport.hidden = true;
      if (destRoad) destRoad.hidden = false;
    });
  }

  // Người dùng gõ Điểm Đi mà chọn trúng một sân bay -> tự đảo chiều và đưa luôn sân bay đó
  // vào ô sân bay của Điểm Đi. Lý do: chiều mặc định là "địa chỉ khách -> sân bay"; nếu điểm
  // ĐI đã là sân bay thì đó là chiều đón khách TỪ sân bay, người dùng lẽ ra phải tự bấm "Đảo
  // chiều" rồi chọn lại sân bay từ đầu — làm thay cho họ.
  //
  // Chỉ chạy khi: đang ở tab sân bay, CHƯA đảo chiều, và sân bay đó có trong danh sách đang
  // phục vụ. Sân bay lạ (vd Changi) thì để nguyên, không đụng gì.
  if (locationInput && startSelect) {
    locationInput.addEventListener('xevip:address-selected', (e) => {
      const isAirportTab = !airportTab || airportTab.classList.contains('active');
      if (!isAirportTab || airportSwapped) return;

      const description = (e.detail && e.detail.description) || locationInput.value;
      const matched = findAirportOptionByAddress(startSelect, description);
      if (!matched) return;

      startSelect.value = matched.value;
      startSelect.setCustomValidity('');
      // Địa chỉ vừa gõ đã được "tiêu thụ" thành lựa chọn sân bay - xoá cả ô lẫn object địa
      // chỉ đã lưu, tránh để lại dữ liệu cũ nếu sau đó người dùng tự đảo chiều về.
      locationInput.value = '';
      XevipAddressAutocomplete.clearSelectedAddress(locationInput);

      airportSwapped = true;
      applyAirportSwap();
      // <select> gán bằng JS không bắn 'change', ô gõ-tìm phía trên không tự biết -> bảo nó
      // vẽ lại (xem enhanceAirportSelect).
      startSelect.dispatchEvent(new CustomEvent('xevip:sync'));

      // Đưa con trỏ sang ô còn thiếu để người dùng gõ tiếp ngay, không phải tự đi tìm.
      if (destAddressInput && !destAddressInput.disabled) destAddressInput.focus();
    });
  }

  if (swapBtn) {
    swapBtn.addEventListener('click', () => {
      const isAirportTab = !airportTab || airportTab.classList.contains('active');
      if (isAirportTab) {
        airportSwapped = !airportSwapped;
        applyAirportSwap();
      } else if (startInput && endInput) {
        const tmpValue = startInput.value;
        const tmpAddress = XevipAddressAutocomplete.getSelectedAddress(startInput);
        const endAddress = XevipAddressAutocomplete.getSelectedAddress(endInput);
        startInput.value = endInput.value;
        endInput.value = tmpValue;
        XevipAddressAutocomplete.setSelectedAddress(startInput, endAddress);
        XevipAddressAutocomplete.setSelectedAddress(endInput, tmpAddress);
      }
    });
  }

  const carTypeSelect = widget.querySelector('.select-car-type');
  const bookingForm = widget.querySelector('.booking-form');
  const submitBtn = widget.querySelector('.booking-submit');
  const modal = document.querySelector('#priceModal');
  if (bookingForm && modal) {
    // Lắng nghe 'submit' (không phải 'click' trên nút) để trình duyệt tự chạy
    // validate required trên các input trước — khớp hành vi form cũ.
    bookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const isAirportTab = !airportTab || airportTab.classList.contains('active');
      const carTypeValue = carTypeSelect ? carTypeSelect.value : '';
      const carTypeLabel = carTypeSelect?.selectedOptions[0]?.textContent || '';
      const isRoundTrip = !!widget.querySelector('.roundtrip-checkbox')?.checked;
      const timeAt = getTripDateTimeIso(widget);

      let tripType, startValue, endValue, checkPayload, registerAddresses;

      if (isAirportTab && !airportSwapped) {
        // FARE_WELL: địa chỉ khách (Điểm Đi) → sân bay (Điểm Đến)
        tripType = 'FARE_WELL';
        const addressObj = XevipAddressAutocomplete.getSelectedAddress(locationInput);
        if (!addressObj) { reportAddressNotSelected(bookingForm, locationInput); return; }
        if (!endSelect?.value) { reportAirportNotSelected(bookingForm, endSelect); return; }
        startValue = locationInput?.value || '';
        endValue = endSelect?.selectedOptions[0]?.textContent || '';
        checkPayload = { airportId: endSelect?.value, address: addressObj, tripType, timeAt, isRoundTrip, vehicleType: carTypeValue };
        registerAddresses = { airportId: endSelect?.value, fromAddressBooking: addressObj, toAddressBooking: null };
      } else if (isAirportTab && airportSwapped) {
        // PICK_UP: sân bay (Điểm Đi) → địa chỉ khách (Điểm Đến)
        tripType = 'PICK_UP';
        const addressObj = XevipAddressAutocomplete.getSelectedAddress(destAddressInput);
        if (!addressObj) { reportAddressNotSelected(bookingForm, destAddressInput); return; }
        if (!startSelect?.value) { reportAirportNotSelected(bookingForm, startSelect); return; }
        startValue = startSelect?.selectedOptions[0]?.textContent || '';
        endValue = destAddressInput?.value || '';
        checkPayload = { airportId: startSelect?.value, address: addressObj, tripType, timeAt, isRoundTrip, vehicleType: carTypeValue };
        registerAddresses = { airportId: startSelect?.value, fromAddressBooking: null, toAddressBooking: addressObj };
      } else {
        // OTHER: đi đường dài, cả 2 đầu đều là địa chỉ tự do
        tripType = 'OTHER';
        const fromAddressObj = XevipAddressAutocomplete.getSelectedAddress(startInput);
        if (!fromAddressObj) { reportAddressNotSelected(bookingForm, startInput); return; }
        const toAddressObj = XevipAddressAutocomplete.getSelectedAddress(endInput);
        if (!toAddressObj) { reportAddressNotSelected(bookingForm, endInput); return; }
        startValue = startInput?.value || '';
        endValue = endInput?.value || '';
        checkPayload = { tripType, isRoundTrip, vehicleType: carTypeValue, fromPlaceId: fromAddressObj.place_id, toPlaceId: toAddressObj.place_id };
        registerAddresses = { airportId: null, fromAddressBooking: fromAddressObj, toAddressBooking: toAddressObj };
      }

      const originalBtnText = submitBtn?.textContent;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Đang kiểm tra giá...'; }
      const result = await XevipApi.checkPrices(checkPayload);
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalBtnText; }

      const priceEntry = result.data && result.data.length ? result.data[0] : null;
      const price = priceEntry ? priceEntry.price : null;

      populateConfirmSummary(widget, modal, carTypeLabel, endValue, startValue);
      updateModalPricing(modal, carTypeLabel, price, result.rateLimited);

      pendingTrip = Object.assign(
        {
          tripType,
          isRoundTrip,
          timeAt,
          vehicleType: carTypeValue,
          price: price || null,
          start: startValue,
          end: endValue,
          date: getTripDateTimeDisplay(widget),
        },
        registerAddresses,
      );
      modal.classList.add('open');
    });
  }
}

/* ---------------------------------------------------------------- */
function initPriceModalSubmit() {
  const modal = document.querySelector('#priceModal');
  const form = document.querySelector('#finalBookingForm');
  const successModal = document.querySelector('#bookingSuccessModal');
  if (!modal || !form) return;

  const nameInput = form.querySelector('#modalName');
  const phoneInput = form.querySelector('#modalPhone');
  const noteInput = form.querySelector('#modalNote');
  const submitBtn = form.querySelector('.confirm-submit-btn');
  const errorEl = form.querySelector('.confirm-submit-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pendingTrip) return;
    if (errorEl) errorEl.hidden = true;

    const payload = {
      phone: phoneInput?.value.trim() || '',
      tripType: pendingTrip.tripType,
      isRoundTrip: pendingTrip.isRoundTrip,
      timeAt: pendingTrip.timeAt,
      vehicleType: pendingTrip.vehicleType,
      airportId: pendingTrip.airportId || null,
      fromAddressBooking: pendingTrip.fromAddressBooking || null,
      toAddressBooking: pendingTrip.toAddressBooking || null,
      name: nameInput?.value.trim() || null,
      price: pendingTrip.price,
      note: noteInput?.value.trim() || null,
    };

    const originalBtnText = submitBtn?.textContent;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Đang gửi...'; }
    const result = await XevipApi.submitTripRegister(payload);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalBtnText; }

    if (!result.success) {
      if (errorEl) {
        const firstError = result.error?.errors?.[0];
        errorEl.textContent = firstError
          ? `Không gửi được: ${firstError.field} (${firstError.code}). Vui lòng kiểm tra lại hoặc gọi hotline.`
          : 'Không gửi được đăng ký chuyến, vui lòng thử lại hoặc gọi hotline.';
        errorEl.hidden = false;
      }
      return;
    }

    console.info('[booking] Đăng ký chuyến thành công:', result.data);
    modal.classList.remove('open');
    form.reset();
    successModal?.classList.add('open');
  });
}

document.addEventListener('click', (e) => {
  if (e.target.matches('.modal-close') || e.target.matches('.modal-overlay')) {
    document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.remove('open'));
  }
});

/* ---------------------------------------------------------------- */
// Tab "Bảng Giá Sân Bay" — dữ liệu giá thật cho 9/10 sân bay (Nội Bài đã có
// sẵn bảng tĩnh trong HTML, giữ nguyên làm trạng thái mặc định). Số cột giá
// mỗi sân bay khác nhau tuỳ loại xe họ phục vụ: 2 cột = Xe 4 chỗ/Xe 7 chỗ,
// 3 cột = Xe 4 chỗ/Xe 7 chỗ/Xe 16 chỗ.
const AIRPORT_PRICING = {
  noibai: {
    columns: ['Xe 4 chỗ', 'Xe 5 chỗ', 'Xe 7 chỗ', 'Xe 16 chỗ'],
    rows: [
      { from: 'Hà Nội', to: 'Nội Bài', arrow: '➜', prices: ['Từ 170.000đ', 'Từ 180.000đ', 'Từ 220.000đ', 'Từ 330.000đ'] },
      { from: 'Nội Bài', to: 'Hà Nội', arrow: '➜', prices: ['Từ 180.000đ', 'Từ 190.000đ', 'Từ 240.000đ', 'Từ 430.000đ'] },
      { label: 'Hai chiều (trong ngày)', prices: ['Từ 360.000đ', 'Từ 370.000đ', 'Từ 410.000đ', 'Từ 650.000đ'] },
    ],
  },
  phubai: {
    columns: ['Xe 4 chỗ', 'Xe 7 chỗ'],
    rows: [
      { from: 'Sân Bay Phú Bài', to: 'TP Huế', arrow: '⇄', prices: ['Từ 170.000đ', 'Từ 230.000đ'] },
      { from: 'Sân Bay Phú Bài', to: 'Vedana Lagoon Resort', arrow: '⇄', prices: ['Từ 380.000đ', 'Từ 600.000đ'] },
      { from: 'Sân Bay Phú Bài', to: 'La Vang, Hải Lăng', arrow: '⇄', prices: ['Từ 900.000đ', 'Từ 1.100.000đ'] },
      { from: 'TP Huế', to: 'Lăng Cô', arrow: '⇄', prices: ['Từ 750.000đ', 'Từ 850.000đ'] },
      { from: 'TP Huế', to: 'Đà Nẵng', arrow: '⇄', prices: ['Từ 1.200.000đ', 'Từ 1.400.000đ'] },
      { from: 'TP Huế', to: 'Hội An', arrow: '⇄', prices: ['Từ 1.300.000đ', 'Từ 1.500.000đ'] },
    ],
  },
  danang: {
    columns: ['Xe 4 chỗ', 'Xe 7 chỗ', 'Xe 16 chỗ'],
    rows: [
      { from: 'Sân Bay Đà Nẵng', to: 'Trung tâm TP', arrow: '➜', prices: ['Từ 120.000đ', 'Từ 150.000đ', 'Từ 310.000đ'] },
      { from: 'Sân Bay Đà Nẵng', to: 'Khu Hội An', arrow: '➜', prices: ['Từ 240.000đ', 'Từ 290.000đ', 'Từ 430.000đ'] },
      { from: 'Đà Nẵng', to: 'VinPearl Nam Hội An', arrow: '➜', prices: ['Từ 350.000đ', 'Từ 450.000đ', 'Từ 550.000đ'] },
      { from: 'Hội An', to: 'Bà Nà Hill', arrow: '➜', prices: ['Từ 450.000đ', 'Từ 600.000đ', 'Từ 750.000đ'] },
    ],
  },
  camranh: {
    columns: ['Xe 4 chỗ', 'Xe 7 chỗ', 'Xe 16 chỗ'],
    rows: [
      { from: 'Nha Trang', to: 'Sân Bay Cam Ranh', arrow: '➜', prices: ['Từ 290.000đ', 'Từ 340.000đ', 'Từ 550.000đ'] },
      { from: 'Sân Bay Cam Ranh', to: 'Nha Trang', arrow: '➜', prices: ['Từ 290.000đ', 'Từ 340.000đ', 'Từ 550.000đ'] },
      { from: 'Nha Trang', to: 'Đảo Khỉ', arrow: '➜', prices: ['Từ 280.000đ', 'Từ 330.000đ', '—'] },
      { from: 'Nha Trang', to: 'Cầu Ngọc Hội', arrow: '➜', prices: ['Từ 290.000đ', 'Từ 340.000đ', '—'] },
      { from: 'Nha Trang', to: 'Núi Chín Khúc', arrow: '➜', prices: ['Từ 340.000đ', 'Từ 390.000đ', '—'] },
      { from: 'Nha Trang', to: 'Ninh Hòa', arrow: '➜', prices: ['Từ 430.000đ', 'Từ 430.000đ', '—'] },
      { from: 'Nha Trang', to: 'Dốc Lết', arrow: '➜', prices: ['Từ 480.000đ', 'Từ 530.000đ', '—'] },
      { from: 'Nha Trang', to: 'Hòn Bà', arrow: '➜', prices: ['Từ 580.000đ', 'Từ 630.000đ', '—'] },
      { from: 'Nha Trang', to: 'Đà Lạt', arrow: '➜', prices: ['Từ 1.250.000đ', 'Từ 1.400.000đ', '—'] },
      { label: 'Hai chiều (trong ngày)', prices: ['—', '—', 'Từ 950.000đ'] },
    ],
  },
  phucat: {
    columns: ['Xe 4 chỗ', 'Xe 7 chỗ', 'Xe 16 chỗ'],
    rows: [
      { from: 'Sân Bay Phù Cát', to: 'TP Quy Nhơn', arrow: '➜', prices: ['Từ 220.000đ', 'Từ 340.000đ', 'Từ 780.000đ'] },
      { from: 'Sân Bay Phù Cát', to: 'Maia Resort', arrow: '➜', prices: ['Từ 270.000đ', 'Từ 340.000đ', 'Từ 750.000đ'] },
      { from: 'Sân Bay Phù Cát', to: 'FLC Nhơn Lý', arrow: '➜', prices: ['Từ 280.000đ', 'Từ 350.000đ', 'Từ 800.000đ'] },
      { from: 'Sân Bay Phù Cát', to: 'Avani Resort', arrow: '➜', prices: ['Từ 320.000đ', 'Từ 420.000đ', 'Từ 880.000đ'] },
    ],
  },
  longthanh: {
    columns: ['Xe 4 chỗ', 'Xe 7 chỗ', 'Xe 16 chỗ'],
    rows: [
      { from: 'TP HCM', to: 'SB Long Thành', arrow: '➜', prices: ['Từ 280.000đ', 'Từ 380.000đ', 'Từ 750.000đ'] },
      { from: 'TP HCM', to: 'SB Long Thành (Hai Chiều)', arrow: '⇄', prices: ['Từ 490.000đ', 'Từ 590.000đ', 'Từ 1.050.000đ'] },
      { label: 'Thuê xe đường dài', prices: ['Từ 8.000đ/km', 'Từ 10.000đ/km', 'Từ 14.000đ/km'] },
    ],
  },
  tansonnhat: {
    columns: ['Xe 4 chỗ', 'Xe 7 chỗ', 'Xe 16 chỗ'],
    rows: [
      { from: 'Quận 1,3,4,5', to: 'SB Tân Sơn Nhất', arrow: '➜', prices: ['Từ 150.000đ', 'Từ 220.000đ', 'Từ 330.000đ'] },
      { from: 'Q.Bình Thạnh, Tân Phú', to: 'SB Tân Sơn Nhất', arrow: '➜', prices: ['Từ 190.000đ', 'Từ 240.000đ', 'Từ 430.000đ'] },
      { from: 'Q.Tân Bình, Phú Nhuận', to: 'SB Tân Sơn Nhất', arrow: '➜', prices: ['Từ 370.000đ', 'Từ 410.000đ', 'Từ 650.000đ'] },
      { from: 'Q2,6,7, Bình Tân, Tân Phú', to: 'SB Tân Sơn Nhất', arrow: '➜', prices: ['Từ 370.000đ', 'Từ 410.000đ', 'Từ 650.000đ'] },
      { label: 'Thuê xe đường dài', prices: ['Từ 8.000đ/km', 'Từ 10.000đ/km', 'Từ 14.000đ/km'] },
    ],
  },
  lienkhuong: {
    columns: ['Xe 4 chỗ', 'Xe 7 chỗ'],
    rows: [
      { from: 'Liên Khương', to: 'Đà Lạt', arrow: '➜', prices: ['Từ 350.000đ', 'Từ 450.000đ'] },
      { from: 'Liên Khương', to: 'Bảo Lộc', arrow: '➜', prices: ['Từ 1.000.000đ', 'Từ 1.100.000đ'] },
      { from: 'Liên Khương', to: 'Phan Rang', arrow: '➜', prices: ['Từ 1.200.000đ', 'Từ 1.450.000đ'] },
      { from: 'Liên Khương', to: 'Cam Ranh', arrow: '➜', prices: ['Từ 1.500.000đ', 'Từ 1.750.000đ'] },
      { from: 'Liên Khương', to: 'Nha Trang', arrow: '➜', prices: ['Từ 1.600.000đ', 'Từ 1.850.000đ'] },
      { from: 'Liên Khương', to: 'Mũi Né', arrow: '➜', prices: ['Từ 1.600.000đ', 'Từ 1.900.000đ'] },
      { from: 'Liên Khương', to: 'Phan Thiết', arrow: '➜', prices: ['Từ 1.700.000đ', 'Từ 2.000.000đ'] },
      { from: 'Liên Khương', to: 'Vũng Tàu', arrow: '➜', prices: ['Từ 2.700.000đ', 'Từ 3.000.000đ'] },
      { from: 'Liên Khương', to: 'Vĩnh Hy', arrow: '➜', prices: ['Từ 1.450.000đ', 'Từ 1.700.000đ'] },
    ],
  },
  phuquoc: {
    columns: ['Xe 4 chỗ', 'Xe 7 chỗ', 'Xe 16 chỗ'],
    rows: [
      { from: 'SB Phú Quốc', to: 'Vinpearl Sarafi', arrow: '➜', prices: ['Từ 390.000đ', 'Từ 490.000đ', 'Từ 690.000đ'] },
      { from: 'SB Phú Quốc', to: 'Dương Đông', arrow: '➜', prices: ['Từ 170.000đ', 'Từ 190.000đ', 'Từ 400.000đ'] },
      { from: 'SB Phú Quốc', to: 'Ông Lang', arrow: '➜', prices: ['Từ 240.000đ', 'Từ 340.000đ', 'Từ 690.000đ'] },
      { from: 'SB Phú Quốc', to: 'Bãi Trường', arrow: '➜', prices: ['Từ 150.000đ', 'Từ 190.000đ', 'Từ 400.000đ'] },
      { from: 'SB Phú Quốc', to: 'An Thới', arrow: '➜', prices: ['Từ 240.000đ', 'Từ 320.000đ', 'Từ 600.000đ'] },
      { from: 'Dương Đông', to: 'Vinpearl Sarafi', arrow: '➜', prices: ['Từ 350.000đ', 'Từ 450.000đ', 'Từ 600.000đ'] },
      { from: 'Dương Đông', to: 'An Thới', arrow: '➜', prices: ['Từ 350.000đ', 'Từ 450.000đ', 'Từ 600.000đ'] },
      { from: 'Ông Lang', to: 'An Thới', arrow: '➜', prices: ['Từ 390.000đ', 'Từ 490.000đ', 'Từ 690.000đ'] },
      { label: 'City Tour 5 tiếng 70km', prices: ['Từ 700.000đ', 'Từ 800.000đ', 'Từ 1.100.000đ'] },
      { label: 'City Tour 10 tiếng 120km', prices: ['Từ 1.100.000đ', 'Từ 1.300.000đ', 'Từ 1.800.000đ'] },
    ],
  },
  cantho: {
    columns: ['Xe 4 chỗ', 'Xe 7 chỗ', 'Xe 16 chỗ'],
    rows: [
      { from: 'Trung tâm TP. Cần Thơ', to: 'Sân bay', arrow: '➜', prices: ['Từ 200.000đ', 'Từ 250.000đ', 'Từ 750.000đ'] },
      { from: 'Sân bay', to: 'Vĩnh Long', arrow: '➜', prices: ['Từ 500.000đ', 'Từ 600.000đ', 'Từ 1.500.000đ'] },
      { from: 'Sân bay', to: 'Hậu Giang', arrow: '➜', prices: ['Từ 550.000đ', 'Từ 650.000đ', 'Từ 1.550.000đ'] },
      { from: 'Sân bay', to: 'Sóc Trăng', arrow: '➜', prices: ['Từ 650.000đ', 'Từ 750.000đ', 'Từ 1.800.000đ'] },
      { from: 'Sân bay', to: 'Đồng Tháp', arrow: '➜', prices: ['Từ 700.000đ', 'Từ 850.000đ', 'Từ 1.700.000đ'] },
      { from: 'Sân bay', to: 'An Giang', arrow: '➜', prices: ['Từ 850.000đ', 'Từ 950.000đ', 'Từ 1.900.000đ'] },
      { from: 'Sân bay', to: 'Cà Mau', arrow: '➜', prices: ['Từ 1.200.000đ', 'Từ 1.400.000đ', 'Từ 1.900.000đ'] },
      { from: 'Sân bay', to: 'Kiên Giang / Rạch Giá', arrow: '➜', prices: ['Từ 1.100.000đ', 'Từ 1.300.000đ', 'Từ 1.900.000đ'] },
    ],
  },
};

function pricingDestinationCell(row) {
  return row.label
    ? row.label
    : '<span class="pricing-route"><span class="pricing-route-point">' + row.from +
      '</span><span class="pricing-route-arrow" aria-label="đến">' + row.arrow +
      '</span><span class="pricing-route-point">' + row.to + '</span></span>';
}

// Trả về cả bảng rộng nhiều cột (desktop) và bộ bảng nhỏ tách riêng theo mỗi
// loại xe (mobile) từ CÙNG một nguồn dữ liệu — CSS chỉ ẩn/hiện cái phù hợp
// theo breakpoint, tránh phải cuộn ngang bảng nhiều cột trên màn hình nhỏ.
function renderPricingTable(airportKey, airportName) {
  const data = AIRPORT_PRICING[airportKey];
  if (!data) return '';

  const headCells = data.columns.map((c) => '<th>' + c + '</th>').join('');
  const bodyRows = data.rows
    .map((row) => {
      const priceCells = row.prices.map((p) => '<td class="price">' + p + '</td>').join('');
      return '<tr><td class="destination">' + pricingDestinationCell(row) + '</td>' + priceCells + '</tr>';
    })
    .join('');
  const wideTable =
    '<table class="pricing-table" role="table" aria-label="Bảng giá ' + airportName + '">' +
    '<thead><tr><th>Điểm đến</th>' + headCells + '</tr></thead>' +
    '<tbody>' + bodyRows + '</tbody></table>';

  const cardGroups = data.columns
    .map((col, colIndex) => {
      const rows = data.rows
        .map((row) => '<tr><td class="destination">' + pricingDestinationCell(row) + '</td><td class="price">' + row.prices[colIndex] + '</td></tr>')
        .join('');
      return (
        '<div class="pricing-card-group">' +
        '<h3 class="pricing-card-group-title">' + col + '</h3>' +
        '<table class="pricing-mini-table" role="table" aria-label="Bảng giá ' + airportName + ' - ' + col + '">' +
        '<tbody>' + rows + '</tbody></table></div>'
      );
    })
    .join('');
  const cards = '<div class="pricing-cards">' + cardGroups + '</div>';

  return wideTable + cards;
}

function initPricingTabs() {
  const tabsWrap = document.querySelector('#priceTabs');
  const container = document.querySelector('#priceTableContainer');
  if (!tabsWrap || !container) return;

  const tabs = tabsWrap.querySelectorAll('button[role="tab"]');
  const activeTab = tabsWrap.querySelector('button.active') || tabs[0];
  if (activeTab) {
    const airportName = activeTab.querySelector('.pricing-tab-name')?.textContent || '';
    container.innerHTML = renderPricingTable(activeTab.dataset.key, airportName);
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('active')) return;
      tabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const key = tab.dataset.key;
      const airportName = tab.querySelector('.pricing-tab-name')?.textContent || '';
      if (AIRPORT_PRICING[key]) {
        container.innerHTML = renderPricingTable(key, airportName);
      } else {
        container.innerHTML =
          '<p class="pricing-placeholder">Bảng giá ' + airportName +
          ' đang được cập nhật. Vui lòng liên hệ hotline 1900.9144 để được báo giá chính xác nhất.</p>';
      }
    });
  });
}

/* ---------------------------------------------------------------- */
function initFareTabs() {
  const tabs = document.querySelectorAll('.fare-tabs button');
  const grids = document.querySelectorAll('.fare-grid');
  if (!tabs.length) return;
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.target;
      grids.forEach((g) => g.classList.toggle('active', g.dataset.panel === target));
    });
  });
}

/* ---------------------------------------------------------------- */
// Video khách hàng — click-to-load: không có <video>/<source> nào trong DOM
// cho tới khi người dùng chủ động bấm play, nên không tốn băng thông/ảnh
// hưởng tốc độ tải trang hay SEO lúc vào trang, và không video nào tự bật.
function initVideoShowcase() {
  document.querySelectorAll('.video-card').forEach((card) => {
    const playBtn = card.querySelector('.video-play-btn');
    const src = card.dataset.videoSrc;
    if (!playBtn || !src) return;
    playBtn.addEventListener('click', () => {
      const video = document.createElement('video');
      video.src = src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      card.innerHTML = '';
      card.appendChild(video);
    });
  });
}

/* ---------------------------------------------------------------- */
function initClientsCarousel() {
  const track = document.querySelector('.clients-track');
  const prev = document.querySelector('.clients-arrow.prev');
  const next = document.querySelector('.clients-arrow.next');
  if (!track) return;
  const itemWidth = 180;
  let offset = 0;
  const maxOffset = Math.max(0, track.children.length * itemWidth - track.parentElement.clientWidth);

  function apply() {
    track.style.transform = `translateX(-${offset}px)`;
  }
  next?.addEventListener('click', () => {
    offset = Math.min(offset + itemWidth * 2, maxOffset);
    apply();
  });
  prev?.addEventListener('click', () => {
    offset = Math.max(offset - itemWidth * 2, 0);
    apply();
  });
}

/* ---------------------------------------------------------------- */
function initScrollTop() {
  const btn = document.querySelector('.scroll-top-btn');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('show', window.scrollY > 600);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ---------------------------------------------------------------- */
/* Form Liên hệ -> CMS (Google Apps Script).
 *
 * ⚠️ KHÔNG đụng gì tới luồng ĐẶT XE ở phía trên — đơn đặt xe vẫn đi thẳng backend thật
 * api.xevipsanbay.com qua js/xevip-api.js, hoàn toàn độc lập với phần này.
 *
 * Dán URL "/exec" của web app GAS vào GAS_EXEC_URL sau khi deploy (xem gas/README.md).
 * Để trống thì form giữ nguyên hành vi cũ (chỉ hiện lời cảm ơn) — không làm vỡ trang.
 */
const GAS_EXEC_URL = 'https://script.google.com/macros/s/AKfycbwjfcy82c6_ywQIN_pffWpCiAEfw-pVPDR996NOPEqwq5SobbP4GiX26npARxfligFHbQ/exec';

function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  const status = form.querySelector('.form-status');
  const submitBtn = form.querySelector('button[type="submit"]');

  // Báo kết quả bằng POPUP giữa màn hình (giống modal "Đặt chuyến thành công" ở trang chủ),
  // không phải 1 dòng chữ nhỏ dưới nút bấm - dòng chữ đó rất dễ bị bỏ sót, khách tưởng bấm
  // hụt rồi gửi lại nhiều lần. Nếu vì lý do gì không tìm thấy modal thì mới rơi về dòng chữ.
  function showResult(message, isError) {
    const modal = document.getElementById('contactResultModal');
    if (!modal) {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle('is-error', !!isError);
      status.classList.add('show');
      return;
    }
    modal.querySelector('#contactResultTitle').textContent = isError ? 'Gửi chưa thành công' : 'Gửi thành công';
    modal.querySelector('#contactResultMessage').textContent = message;
    const icon = modal.querySelector('#contactResultIcon');
    icon.innerHTML = isError ? '!' : '&#10003;';
    icon.classList.toggle('is-error', !!isError);
    modal.classList.add('open');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    if (!GAS_EXEC_URL) {
      console.warn('[xevip] GAS_EXEC_URL chưa được cấu hình — liên hệ chưa được gửi đi đâu cả.');
      showResult('Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.', false);
      form.reset();
      return;
    }

    const payload = {
      formType: 'contact',
      name: form.elements['your-name'].value.trim(),
      phone: form.elements['your-phone'].value.trim(),
      message: form.elements['your-message'].value.trim(),
      _hp: form.elements['_hp'] ? form.elements['_hp'].value : '',
    };

    const originalLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang gửi...';
    }
    try {
      // Content-Type text/plain (KHÔNG phải application/json) để trình duyệt giữ đây là
      // "simple request", không tự gửi OPTIONS preflight trước — GAS không xử lý được
      // OPTIONS nên có preflight là chắc chắn lỗi CORS.
      const res = await fetch(GAS_EXEC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Gửi không thành công');
      showResult('Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.', false);
      form.reset();
    } catch (err) {
      console.error('[xevip] Gửi liên hệ thất bại:', err);
      showResult('Rất tiếc, gửi chưa thành công. Quý khách vui lòng gọi hotline 1900.9144 giúp em nhé.', true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    }
  });
}
