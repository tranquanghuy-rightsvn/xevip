document.addEventListener('DOMContentLoaded', () => {
  initLogoEntrance();
  initStickyHeader();
  initMobileNav();
  initBookingWidget();
  initFareTabs();
  initClientsCarousel();
  initScrollTop();
  initDateDefault();
  initLocationSearch();
});

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
function initStickyHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const onScroll = () => {
    header.classList.toggle('is-stuck', window.scrollY > 40);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
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
  const drawerItem = drawer.querySelector('.drawer-item');
  const parentLink = drawer.querySelector('.drawer-parent-link');
  const close = () => {
    drawer.classList.remove('open');
    toggle.classList.remove('is-active');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
    drawerItem?.classList.remove('open');
    parentLink?.setAttribute('aria-expanded', 'false');
  };
  toggle.addEventListener('click', () => (isOpen() ? close() : open()));
  drawer.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
  parentLink?.addEventListener('click', () => {
    const expanded = drawerItem.classList.toggle('open');
    parentLink.setAttribute('aria-expanded', String(expanded));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) close();
  });
}

/* ---------------------------------------------------------------- */
function initDateDefault() {
  const inputs = document.querySelectorAll('.input-ngaydatxe');
  if (!inputs.length) return;
  const pad = (n) => (n < 10 ? '0' + n : n);
  const now = new Date();
  const value = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  inputs.forEach((i) => { i.value = value; });
}

/* ---------------------------------------------------------------- */
function initBookingWidget() {
  document.querySelectorAll('.booking-widget, .footer-booking').forEach(setupBookingWidget);
}

const CAR_PRICES_KHANH_HOA = {
  'Xe 4 chỗ': 450000,
  'Xe 5 chỗ': 500000,
  'Xe 7 chỗ': 650000,
  'Xe 16 chỗ': 900000,
};

function formatVnd(amount) {
  return amount.toLocaleString('vi-VN') + 'đ';
}

function updateModalPricing(modal, carType, isKhanhHoa) {
  const cartypeEl = modal.querySelector('.confirm-price-cartype');
  const amountEl = modal.querySelector('.confirm-price-amount');
  const note = modal.querySelector('.price-unavailable-note');
  const price = carType ? CAR_PRICES_KHANH_HOA[carType] : null;
  const hasPrice = !!(isKhanhHoa && price);

  if (cartypeEl) cartypeEl.textContent = carType || 'Chưa chọn loại xe';
  if (amountEl) amountEl.textContent = hasPrice ? formatVnd(price) : '';
  if (note) note.hidden = !carType || hasPrice;
}

function populateConfirmSummary(widget, modal, carType, isAirportTab) {
  const startValue = isAirportTab
    ? widget.querySelector('.input-location-search')?.value
    : widget.querySelector('.input-start-point')?.value;
  const endValue = widget.querySelector('.end-point-input')?.value;
  const dateValue = widget.querySelector('.input-ngaydatxe')?.value;
  const isRoundtrip = widget.querySelector('#roundtrip')?.checked;
  const tripType = isRoundtrip ? 'Chuyến 2 chiều' : 'Chuyến 1 chiều';

  const startEl = modal.querySelector('.confirm-start');
  const endEl = modal.querySelector('.confirm-end');
  const timeEl = modal.querySelector('.confirm-time');
  const typeEl = modal.querySelector('.confirm-cartype');

  if (startEl) startEl.textContent = startValue || 'Chưa chọn';
  if (endEl) endEl.textContent = endValue || 'Chưa chọn';
  if (timeEl) timeEl.textContent = dateValue || 'Chưa chọn';
  if (typeEl) typeEl.textContent = carType ? `${carType} | ${tripType}` : tripType;
}

function setupBookingWidget(widget) {
  const airportTab = widget.querySelector('.tab-airport');
  const roadTab = widget.querySelector('.tab-road');
  const endInput = widget.querySelector('.end-point-input');
  const startAirport = widget.querySelector('.start-point-airport');
  const startRoad = widget.querySelector('.start-point-road');
  const locationInput = widget.querySelector('.input-location-search');

  const startInput = widget.querySelector('.input-start-point');

  if (airportTab && roadTab) {
    airportTab.addEventListener('click', () => {
      airportTab.classList.add('active');
      roadTab.classList.remove('active');
      resetLocationInput(endInput);
      if (endInput) {
        endInput.value = 'Sân bay Cam Ranh';
        endInput.setAttribute('disabled', 'disabled');
      }
      resetLocationInput(startInput, { clearValue: true });
      if (startAirport) startAirport.hidden = false;
      if (startRoad) startRoad.hidden = true;
    });
    roadTab.addEventListener('click', () => {
      roadTab.classList.add('active');
      airportTab.classList.remove('active');
      resetLocationInput(endInput, { clearValue: true });
      if (endInput) {
        endInput.removeAttribute('disabled');
        endInput.placeholder = 'Điểm đến';
      }
      if (startAirport) startAirport.hidden = true;
      if (startRoad) startRoad.hidden = false;
    });
  }

  const swapBtn = widget.querySelector('.swap-btn');
  if (swapBtn && startInput && endInput) {
    swapBtn.addEventListener('click', () => {
      if (endInput.hasAttribute('disabled')) return;
      const readLocationData = (input) => ({
        value: input.value,
        provinceCode: input.dataset.provinceCode,
        wardCode: input.dataset.wardCode,
        isKhanhHoa: input.dataset.isKhanhHoa,
      });
      const applyLocationData = (input, data) => {
        input.value = data.value;
        ['provinceCode', 'wardCode', 'isKhanhHoa'].forEach((key) => {
          if (data[key]) input.dataset[key] = data[key];
          else delete input.dataset[key];
        });
      };
      const startData = readLocationData(startInput);
      const endData = readLocationData(endInput);
      applyLocationData(startInput, endData);
      applyLocationData(endInput, startData);
    });
  }

  const carTypeSelect = widget.querySelector('.select-car-type');
  const submitBtn = widget.querySelector('.booking-submit');
  const modal = document.querySelector('#priceModal');
  if (submitBtn && modal) {
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isAirportTab = !airportTab || airportTab.classList.contains('active');
      const isKhanhHoa = !!(isAirportTab && locationInput && locationInput.dataset.isKhanhHoa === '1');
      const carType = carTypeSelect ? carTypeSelect.value : '';
      populateConfirmSummary(widget, modal, carType, isAirportTab);
      updateModalPricing(modal, carType, isKhanhHoa);
      modal.classList.add('open');
    });
  }
}

/* ---------------------------------------------------------------- */
let placesIndexCache = null;
function loadPlacesIndex() {
  if (placesIndexCache) return placesIndexCache;
  const provinces = window.PROVINCES_DATA || [];
  const localitiesByWardCode = new Map();
  (window.LOCALITIES_DATA || []).forEach((w) => {
    localitiesByWardCode.set(String(w.ward_code), w.localities || []);
  });

  const items = [];
  provinces.forEach((p) => {
    const isKhanhHoa = p.codename === 'khanh_hoa';
    (p.wards || []).forEach((w) => {
      items.push({
        label: `${w.name}, ${p.name}`,
        wardName: w.name,
        provinceName: p.name,
        wardCode: w.code,
        provinceCode: p.code,
        isKhanhHoa,
        searchWard: normalizeVN(stripAdminPrefix(w.name)),
        searchProvince: normalizeVN(stripAdminPrefix(p.name)),
      });

      // Khánh Hòa: đưa luôn cấp cơ sở thứ 3 (thôn/tổ dân phố) vào chỉ mục tìm kiếm
      if (isKhanhHoa) {
        const localities = localitiesByWardCode.get(String(w.code)) || [];
        localities.forEach((loc) => {
          items.push({
            label: `${loc.name}, ${w.name}, ${p.name}`,
            localityName: loc.name,
            wardName: w.name,
            provinceName: p.name,
            wardCode: w.code,
            provinceCode: p.code,
            isKhanhHoa: true,
            searchLocality: normalizeVN(loc.name),
            searchWard: normalizeVN(stripAdminPrefix(w.name)),
            searchProvince: normalizeVN(stripAdminPrefix(p.name)),
          });
        });
      }
    });
  });
  placesIndexCache = Promise.resolve(items);
  return placesIndexCache;
}

const ADMIN_PREFIX_RE = /^(Thành phố|Tỉnh|Phường|Xã|Thị trấn|Thị xã|Quận|Huyện|Đặc khu)\s+/i;
function stripAdminPrefix(name) {
  return (name || '').replace(ADMIN_PREFIX_RE, '').trim();
}

function normalizeVN(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Điểm khớp của 1 token trên 1 trường: null nếu không khớp, cao hơn khi khớp đầu tên
// hoặc khớp trọn từ (tránh khớp nhầm vào giữa một từ khác, vd "nha" trong "nhật").
function fieldMatchScore(text, token, startScore, includeScore, wholeWordBonus) {
  if (!text || !text.includes(token)) return null;
  let s = text.startsWith(token) ? startScore : includeScore;
  if (new RegExp(`\\b${escapeRegExp(token)}\\b`).test(text)) s += wholeWordBonus;
  return s;
}

// Với mỗi token, chỉ lấy điểm khớp tốt nhất trong 3 cấp (thôn/tổ > phường/xã > tỉnh) -
// không cộng dồn nhiều cấp, để một khớp trùng ngẫu nhiên ở cấp không liên quan không
// đội điểm lên trên một khớp đúng và rõ ràng hơn ở cấp khác.
function scorePlaceMatch(tokens, item) {
  let score = 0;
  for (const token of tokens) {
    const candidates = [
      item.searchLocality ? fieldMatchScore(item.searchLocality, token, 70, 30, 10) : null,
      fieldMatchScore(item.searchWard, token, 60, 30, 15),
      fieldMatchScore(item.searchProvince, token, 25, 12, 6),
    ].filter((s) => s !== null);
    if (!candidates.length) return -1;
    score += Math.max(...candidates);
  }
  // Thưởng thêm khi cả cụm từ khớp liên tiếp, nhưng chỉ xét trong TỪNG trường riêng lẻ -
  // không ghép nối các trường lại rồi kiểm tra, vì từ cuối của trường này nối với từ đầu
  // của trường kia có thể vô tình tạo thành một địa danh khác không liên quan.
  const joined = tokens.length > 1 ? tokens.join(' ') : null;
  if (joined) {
    const matchesWholePhrase = [item.searchLocality, item.searchWard, item.searchProvince].some(
      (field) => field && field.includes(joined)
    );
    if (matchesWholePhrase) score += 30;
  }
  return score;
}

function searchPlaces(items, query) {
  const tokens = normalizeVN(query).split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) return [];
  const results = [];
  for (const item of items) {
    const score = scorePlaceMatch(tokens, item);
    if (score >= 0) results.push({ item, score });
  }
  results.sort((a, b) => b.score - a.score || a.item.wardName.localeCompare(b.item.wardName, 'vi'));
  return results.slice(0, 20).map((r) => r.item);
}

function attachLocationAutocomplete(input, list) {
  if (!input || !list) return;

  let activeIndex = -1;
  let currentItems = [];
  let debounceTimer = null;

  function clearSelection() {
    delete input.dataset.provinceCode;
    delete input.dataset.wardCode;
    delete input.dataset.isKhanhHoa;
  }

  function closeList() {
    list.hidden = true;
    list.innerHTML = '';
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
      .map((item, i) => {
        const main = item.localityName || item.wardName;
        const rest = item.localityName ? `${item.wardName}, ${item.provinceName}` : item.provinceName;
        return `<li class="location-suggestion-item" data-index="${i}"><strong>${main}</strong>, ${rest}</li>`;
      })
      .join('');
    list.hidden = false;
  }

  function selectItem(item) {
    input.value = item.label;
    input.dataset.provinceCode = item.provinceCode;
    input.dataset.wardCode = item.wardCode;
    input.dataset.isKhanhHoa = item.isKhanhHoa ? '1' : '';
    closeList();
  }

  function setActive(index) {
    const children = list.querySelectorAll('.location-suggestion-item');
    children.forEach((el) => el.classList.remove('active'));
    if (index >= 0 && children[index]) {
      children[index].classList.add('active');
      children[index].scrollIntoView({ block: 'nearest' });
    }
    activeIndex = index;
  }

  input.addEventListener('input', () => {
    clearSelection();
    const query = input.value;
    clearTimeout(debounceTimer);
    if (!query.trim()) {
      closeList();
      return;
    }
    debounceTimer = setTimeout(() => {
      loadPlacesIndex().then((items) => renderList(searchPlaces(items, query)));
    }, 250);
  });

  input.addEventListener('keydown', (e) => {
    if (list.hidden || !currentItems.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((activeIndex + 1) % currentItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((activeIndex - 1 + currentItems.length) % currentItems.length);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        selectItem(currentItems[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      closeList();
    }
  });

  list.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.location-suggestion-item');
    if (!item) return;
    e.preventDefault();
    const idx = Number(item.dataset.index);
    if (currentItems[idx]) selectItem(currentItems[idx]);
  });

  document.addEventListener('click', (e) => {
    if (e.target !== input && !list.contains(e.target)) closeList();
  });
}

// Áp dụng cho cả điểm đi (sân bay và đường dài) và điểm đến (đường dài)
function initLocationSearch() {
  document.querySelectorAll('.location-autocomplete-input').forEach((input) => {
    const list = input.closest('.location-search-wrap')?.querySelector('.location-suggestions');
    attachLocationAutocomplete(input, list);
  });
}

function resetLocationInput(input, { clearValue = false } = {}) {
  if (!input) return;
  if (clearValue) input.value = '';
  delete input.dataset.provinceCode;
  delete input.dataset.wardCode;
  delete input.dataset.isKhanhHoa;
  const list = input.closest('.location-search-wrap')?.querySelector('.location-suggestions');
  if (list) {
    list.hidden = true;
    list.innerHTML = '';
  }
}

document.addEventListener('click', (e) => {
  if (e.target.matches('.modal-close') || e.target.matches('.modal-overlay')) {
    document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.remove('open'));
  }
});

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

