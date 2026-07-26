document.addEventListener('DOMContentLoaded', () => {
  initStickyHeader();
  initMobileNav();
  initHeroSlider();
  initBookingWidget();
  initFareTabs();
  initTestimonialSlider();
  initClientsCarousel();
  initScrollTop();
  initDateDefault();
  initProvinceWardSelect();
});

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
  const overlay = document.querySelector('.drawer-overlay');
  if (!toggle || !drawer) return;
  const close = () => {
    drawer.classList.remove('open');
    overlay?.classList.remove('open');
  };
  toggle.addEventListener('click', () => {
    drawer.classList.add('open');
    overlay?.classList.add('open');
  });
  overlay?.addEventListener('click', close);
}

/* ---------------------------------------------------------------- */
function initHeroSlider() {
  const slides = document.querySelectorAll('.hero-slide');
  const dots = document.querySelectorAll('.hero-dots button');
  const prevBtn = document.querySelector('.hero-arrow--prev');
  const nextBtn = document.querySelector('.hero-arrow--next');
  if (!slides.length) return;
  let index = 0;
  let timer = null;

  function show(i) {
    index = (i + slides.length) % slides.length;
    slides.forEach((s, n) => s.classList.toggle('active', n === index));
    dots.forEach((d, n) => d.classList.toggle('active', n === index));
  }

  function restartAutoplay() {
    clearInterval(timer);
    timer = setInterval(() => show(index + 1), 6000);
  }

  dots.forEach((dot, i) => dot.addEventListener('click', () => { show(i); restartAutoplay(); }));
  prevBtn?.addEventListener('click', () => { show(index - 1); restartAutoplay(); });
  nextBtn?.addEventListener('click', () => { show(index + 1); restartAutoplay(); });

  restartAutoplay();
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

function updateModalPricing(modal, isKhanhHoa) {
  const note = modal.querySelector('.price-unavailable-note');
  modal.querySelectorAll('.car-type-item').forEach((item) => {
    const priceEl = item.querySelector('.car-price');
    if (!priceEl) return;
    const price = CAR_PRICES_KHANH_HOA[item.dataset.value];
    priceEl.textContent = isKhanhHoa && price ? formatVnd(price) : '';
  });
  if (note) note.hidden = isKhanhHoa;
}

function setupBookingWidget(widget) {
  const airportTab = widget.querySelector('.tab-airport');
  const roadTab = widget.querySelector('.tab-road');
  const endInput = widget.querySelector('.end-point-input');
  const startAirport = widget.querySelector('.start-point-airport');
  const startWardRow = widget.querySelector('.start-point-ward-row');
  const startLocalityRow = widget.querySelector('.start-point-locality-row');
  const startLocalityFreetextRow = widget.querySelector('.start-point-locality-freetext-row');
  const startRoad = widget.querySelector('.start-point-road');
  const provinceSelect = widget.querySelector('.select-province');
  const wardSelect = widget.querySelector('.select-ward');
  const localitySelect = widget.querySelector('.select-locality');

  if (airportTab && roadTab) {
    airportTab.addEventListener('click', () => {
      airportTab.classList.add('active');
      roadTab.classList.remove('active');
      if (endInput) {
        endInput.value = 'Sân bay Cam Ranh';
        endInput.setAttribute('disabled', 'disabled');
      }
      if (startAirport) startAirport.hidden = false;
      if (startRoad) startRoad.hidden = true;
      if (startWardRow) startWardRow.hidden = !(provinceSelect && provinceSelect.value);
      if (startLocalityRow) startLocalityRow.hidden = !(localitySelect && localitySelect.options.length > 1);
      if (startLocalityFreetextRow) {
        const showFreetext = wardSelect && wardSelect.value && wardSelect.dataset.isKhanhHoa !== '1';
        startLocalityFreetextRow.hidden = !showFreetext;
      }
    });
    roadTab.addEventListener('click', () => {
      roadTab.classList.add('active');
      airportTab.classList.remove('active');
      if (endInput) {
        endInput.value = '';
        endInput.removeAttribute('disabled');
        endInput.placeholder = 'Điểm đến';
      }
      if (startAirport) startAirport.hidden = true;
      if (startWardRow) startWardRow.hidden = true;
      if (startLocalityRow) startLocalityRow.hidden = true;
      if (startLocalityFreetextRow) startLocalityFreetextRow.hidden = true;
      if (startRoad) startRoad.hidden = false;
    });
  }

  const swapBtn = widget.querySelector('.swap-btn');
  const startInput = widget.querySelector('.input-start-point');
  if (swapBtn && startInput && endInput) {
    swapBtn.addEventListener('click', () => {
      if (endInput.hasAttribute('disabled')) return;
      const tmp = startInput.value;
      startInput.value = endInput.value;
      endInput.value = tmp;
    });
  }

  const submitBtn = widget.querySelector('.booking-submit');
  const modal = document.querySelector('#priceModal');
  if (submitBtn && modal) {
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isAirportTab = !airportTab || airportTab.classList.contains('active');
      const isKhanhHoa = !!(isAirportTab && wardSelect && wardSelect.value && wardSelect.dataset.isKhanhHoa === '1');
      updateModalPricing(modal, isKhanhHoa);
      modal.classList.add('open');
    });
  }
}

/* ---------------------------------------------------------------- */
let localitiesCache = null;
function loadLocalities() {
  if (localitiesCache) return localitiesCache;
  localitiesCache = fetch('area/localities.json')
    .then((res) => res.json())
    .catch((err) => {
      console.error('Không tải được danh sách thôn/tổ dân phố:', err);
      return [];
    });
  return localitiesCache;
}

function initProvinceWardSelect() {
  const provinceSelect = document.querySelector('.select-province');
  const wardSelect = document.querySelector('.select-ward');
  const wardRow = document.querySelector('.start-point-ward-row');
  const localitySelect = document.querySelector('.select-locality');
  const localityRow = document.querySelector('.start-point-locality-row');
  const localityFreetextRow = document.querySelector('.start-point-locality-freetext-row');
  const localityFreetextInput = document.querySelector('.input-locality-freetext');
  if (!provinceSelect || !wardSelect || !wardRow) return;

  function resetLocality() {
    if (localitySelect && localityRow) {
      localitySelect.innerHTML = '<option value="">-- Chọn thôn/tổ dân phố --</option>';
      localityRow.hidden = true;
    }
    if (localityFreetextRow) {
      localityFreetextRow.hidden = true;
      if (localityFreetextInput) localityFreetextInput.value = '';
    }
  }

  fetch('area/provinces.json')
    .then((res) => res.json())
    .then((provinces) => {
      const sorted = [...provinces].sort((a, b) => {
        if (a.codename === 'khanh_hoa') return -1;
        if (b.codename === 'khanh_hoa') return 1;
        return 0;
      });

      sorted.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.code;
        opt.textContent = p.name;
        provinceSelect.appendChild(opt);
      });

      provinceSelect.addEventListener('change', () => {
        const province = provinces.find((p) => String(p.code) === provinceSelect.value);
        wardSelect.innerHTML = '<option value="">-- Chọn phường/xã --</option>';
        resetLocality();
        if (province && province.wards && province.wards.length) {
          province.wards.forEach((w) => {
            const opt = document.createElement('option');
            opt.value = w.code;
            opt.textContent = w.name;
            wardSelect.appendChild(opt);
          });
          wardRow.hidden = false;
        } else {
          wardRow.hidden = true;
        }

        if (localitySelect) {
          wardSelect.dataset.isKhanhHoa = province && province.codename === 'khanh_hoa' ? '1' : '';
        }
      });

      wardSelect.addEventListener('change', () => {
        resetLocality();
        if (!wardSelect.value) return;

        if (wardSelect.dataset.isKhanhHoa === '1' && localitySelect && localityRow) {
          loadLocalities().then((localities) => {
            const wardData = localities.find((w) => String(w.ward_code) === wardSelect.value);
            if (!wardData || !wardData.localities || !wardData.localities.length) {
              // Khánh Hòa nhưng chưa có dữ liệu thôn/tổ cho phường/xã này (vd. Đặc khu Trường Sa)
              if (localityFreetextRow) localityFreetextRow.hidden = false;
              return;
            }
            wardData.localities.forEach((loc) => {
              const opt = document.createElement('option');
              opt.value = loc.name;
              opt.textContent = loc.name;
              localitySelect.appendChild(opt);
            });
            localityRow.hidden = false;
          });
        } else if (localityFreetextRow) {
          // Tỉnh khác Khánh Hòa: không có dữ liệu đơn vị cấp cơ sở thứ 3, cho nhập tự do
          localityFreetextRow.hidden = false;
        }
      });
    })
    .catch((err) => console.error('Không tải được danh sách tỉnh/phường:', err));
}

document.addEventListener('click', (e) => {
  if (e.target.matches('.modal-close') || e.target.matches('.modal-overlay')) {
    document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.remove('open'));
  }
  const carItem = e.target.closest('.car-type-item');
  if (carItem) {
    carItem.parentElement.querySelectorAll('.car-type-item').forEach((c) => c.classList.remove('selected'));
    carItem.classList.add('selected');
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
function initTestimonialSlider() {
  const track = document.querySelector('.testimonial-track');
  const dots = document.querySelectorAll('.testimonial-nav button');
  if (!track || !dots.length) return;
  const cards = track.querySelectorAll('.testimonial-card');
  const perPage = window.innerWidth <= 1000 ? 1 : 3;
  const pages = Math.ceil(cards.length / perPage);

  function show(page) {
    cards.forEach((card, i) => {
      card.style.display = Math.floor(i / perPage) === page ? '' : 'none';
    });
    dots.forEach((d, i) => d.classList.toggle('active', i === page));
  }

  dots.forEach((dot, i) => dot.addEventListener('click', () => show(i)));
  let current = 0;
  show(0);
  setInterval(() => {
    current = (current + 1) % pages;
    show(current);
  }, 5000);
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

