// Heritage & Horsepower - showroom script

const API_URL = "https://api-web.dnccudinus.org/api/mobil";
const CACHE_KEY = "hh-cars-cache";
const API_TIMEOUT = 10000;

// The API sends Indonesian words, the website is in English
const statusLabel = { tersedia: "Available", sold: "Sold" };
const fuelLabel = { Bensin: "Petrol", Listrik: "Electric", Diesel: "Diesel", Hybrid: "Hybrid" };
const gearLabel = { Matic: "Automatic", Manual: "Manual", CVT: "CVT" };

const FOUNDED_YEAR = 1962;
const HERO_SLIDES = 5;
const SLIDE_DELAY = 6500;

let allCars = [];

const grid = document.getElementById("car-grid");
const message = document.getElementById("grid-message");
const resultCount = document.getElementById("result-count");
const searchInput = document.getElementById("search");
const brandSelect = document.getElementById("brand");
const statusSelect = document.getElementById("status");
const sortSelect = document.getElementById("sort");
const fuelSelect = document.getElementById("fuel");
const dialog = document.getElementById("car-dialog");
const dialogBody = document.getElementById("dialog-body");

const hero = document.getElementById("home");
const heroSlides = document.getElementById("hero-slides");
const heroCard = document.getElementById("hero-card");
const heroControls = document.getElementById("hero-controls");
const heroDots = document.getElementById("hero-dots");
const heroCount = document.getElementById("hero-count");

const marquee = document.getElementById("marquee");
const marqueeTrack = document.getElementById("marquee-track");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- small helpers ---------- */

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatPrice(value) {
  return "Rp " + Number(value).toLocaleString("id-ID");
}

function isSold(car) {
  return car.status === "sold";
}

function translate(dictionary, key) {
  return dictionary[key] || key;
}

function carSpecs(car) {
  return [car.tahun, translate(gearLabel, car.transmisi), translate(fuelLabel, car.bahan_bakar)];
}

// Optional: swap the API name/photo for your own, matched by the car id from the API.
// Put your photos in the images folder, then fill in like this (remove the // first):
// const myOverrides = {
//   61: { nama: "1965 Ford Mustang Fastback", foto: "images/mustang.jpg" },
//   60: { nama: "1959 Volkswagen Beetle", foto: "images/beetle.jpg" }
// };
const myOverrides = {};

/* ---------- loading data ---------- */

async function loadCars() {
  showSkeletons();
  message.hidden = true;

  try {
    let rawCars;
    let fromCache = false;

    try {
      rawCars = await fetchCars();
    } catch (apiError) {
      // no connection? fall back to the last list that loaded fine
      console.warn("API unavailable, trying saved copy:", apiError);
      rawCars = readCache();
      if (!rawCars) throw apiError;
      fromCache = true;
    }

    allCars = rawCars.map(normalizeCar).map((car) => ({ ...car, ...(myOverrides[car.id] || {}) }));

    fillBrandOptions();
    buildHero();
    buildMarquee();
    updateStats();
    render();
    if (fromCache) resultCount.textContent += " (saved copy, you may be offline)";
  } catch (error) {
    console.error("Could not load cars:", error);
    grid.innerHTML = "";
    resultCount.textContent = "";
    showHeroError();
    showMessage(
      "Sorry, the showroom doors seem to be stuck. We could not load our cars just now.",
      "Try again",
      loadCars
    );
  }
}

// asks the official endpoint for the cars, gives up after 10 seconds
async function fetchCars() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(API_URL, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error("Server answered with status " + response.status);
    }

    const result = await response.json();
    if (!result || !Array.isArray(result.data)) {
      throw new Error("Unexpected response from the server");
    }

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(result.data));
    } catch (storageError) {
      /* storage full or blocked, not important */
    }
    return result.data;
  } finally {
    clearTimeout(timer);
  }
}

function readCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY));
    return Array.isArray(saved) && saved.length ? saved : null;
  } catch (error) {
    return null;
  }
}

// tidy the raw API record: right types, and a model name without the make in front
function normalizeCar(raw) {
  const brand = String(raw.brand || "").trim();
  const name = String(raw.nama || "").trim();
  const startsWithBrand = brand && name.toLowerCase().startsWith(brand.toLowerCase());
  const model = startsWithBrand ? name.slice(brand.length).trim() : name;

  return {
    ...raw,
    id: Number(raw.id),
    brand: brand,
    nama: name,
    model: model || name,
    harga: Number(raw.harga) || 0,
    tahun: Number(raw.tahun) || "",
    status: String(raw.status || "").toLowerCase(),
    foto: raw.foto || ""
  };
}

function showSkeletons() {
  grid.innerHTML = "";
  resultCount.textContent = "Opening the showroom...";
  for (let i = 0; i < 6; i++) {
    grid.appendChild(make("div", "car-card skeleton"));
  }
}

function showMessage(text, buttonText, onClick) {
  message.innerHTML = "";
  message.appendChild(make("p", "", text));

  if (buttonText) {
    const button = make("button", "btn", buttonText);
    button.type = "button";
    button.addEventListener("click", onClick);
    message.appendChild(button);
  }

  message.hidden = false;
}

function fillBrandOptions() {
  const brands = [...new Set(allCars.map((car) => car.brand))].sort();

  // keep only the "All makes" option, so a retry does not add the brands twice
  brandSelect.length = 1;

  brands.forEach((brand) => {
    const option = make("option", "", brand);
    option.value = brand;
    brandSelect.appendChild(option);
  });

  const fuels = [...new Set(allCars.map((car) => car.bahan_bakar))].sort();
  fuelSelect.length = 1;

  fuels.forEach((fuel) => {
    const option = make("option", "", translate(fuelLabel, fuel));
    option.value = fuel;
    fuelSelect.appendChild(option);
  });
}

/* ---------- hero slideshow ---------- */

const heroState = { cars: [], index: 0, timer: null };

function buildHero() {
  // the most valuable cars still for sale make the best first impression
  const cars = allCars
    .filter((car) => !isSold(car))
    .sort((a, b) => b.harga - a.harga)
    .slice(0, HERO_SLIDES);

  heroState.cars = cars;
  heroSlides.innerHTML = "";
  heroDots.innerHTML = "";

  if (cars.length === 0) {
    showHeroError("New arrivals are on their way.");
    return;
  }

  cars.forEach((car, i) => {
    const img = make("img", "hero-slide");
    img.src = car.foto;
    img.alt = "";
    img.addEventListener("error", () => {
      img.style.display = "none";
    });
    heroSlides.appendChild(img);

    const dot = make("button", "hero-dot");
    dot.type = "button";
    dot.setAttribute("aria-label", "Show " + car.nama);
    dot.addEventListener("click", () => goToSlide(i, true));
    heroDots.appendChild(dot);
  });

  heroControls.hidden = cars.length < 2;
  showSlide(0);
  startSlideshow();
}

function showHeroError(text) {
  heroCard.className = "hero-card";
  heroCard.innerHTML = "";
  heroCard.appendChild(make("p", "hero-card-empty", text || "Our cars could not be loaded just now."));
  heroControls.hidden = true;
}

function showSlide(index) {
  const total = heroState.cars.length;
  heroState.index = (index + total) % total;
  const car = heroState.cars[heroState.index];

  heroSlides.querySelectorAll(".hero-slide").forEach((slide, i) => {
    slide.classList.toggle("active", i === heroState.index);
  });
  heroDots.querySelectorAll(".hero-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === heroState.index);
  });
  heroCount.textContent = String(heroState.index + 1).padStart(2, "0") + " / " + String(total).padStart(2, "0");

  fillHeroCard(car);
}

function fillHeroCard(car) {
  heroCard.innerHTML = "";

  heroCard.appendChild(make("p", "hero-card-label", "Featured motorcar"));
  heroCard.appendChild(make("p", "car-brand", car.brand));
  heroCard.appendChild(make("h2", "hero-card-name", car.model));

  const specs = make("ul", "hero-card-specs");
  carSpecs(car).forEach((item) => specs.appendChild(make("li", "", item)));
  heroCard.appendChild(specs);

  const foot = make("div", "hero-card-foot");
  foot.appendChild(make("span", "hero-card-price", formatPrice(car.harga)));

  const button = make("button", "link-btn", "View details");
  button.type = "button";
  button.addEventListener("click", () => openDetail(car));
  foot.appendChild(button);
  heroCard.appendChild(foot);

  // restart the small fade-in each time the car changes
  heroCard.classList.remove("swap");
  void heroCard.offsetWidth;
  heroCard.classList.add("swap");
}

function goToSlide(index, restart) {
  showSlide(index);
  if (restart) startSlideshow();
}

function startSlideshow() {
  stopSlideshow();
  if (reduceMotion || heroState.cars.length < 2) return;
  heroState.timer = setInterval(() => showSlide(heroState.index + 1), SLIDE_DELAY);
}

function stopSlideshow() {
  clearInterval(heroState.timer);
  heroState.timer = null;
}

document.getElementById("hero-prev").addEventListener("click", () => goToSlide(heroState.index - 1, true));
document.getElementById("hero-next").addEventListener("click", () => goToSlide(heroState.index + 1, true));

// pause while the visitor is reading the card or the tab is hidden
hero.addEventListener("mouseenter", stopSlideshow);
hero.addEventListener("mouseleave", startSlideshow);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopSlideshow();
  else startSlideshow();
});

/* ---------- brand marquee ---------- */

function buildMarquee() {
  const brands = [...new Set(allCars.map((car) => car.brand))].sort();
  marqueeTrack.innerHTML = "";

  if (brands.length === 0) {
    marquee.hidden = true;
    return;
  }

  // the list is repeated 4 times so the loop (-50%) never shows a gap
  for (let round = 0; round < 4; round++) {
    brands.forEach((brand) => {
      const item = make("button", "marquee-item", brand);
      item.type = "button";
      if (round > 0) {
        item.tabIndex = -1;
        item.setAttribute("aria-hidden", "true");
      }
      item.addEventListener("click", () => filterByBrand(brand));
      marqueeTrack.appendChild(item);
    });
  }

  marquee.hidden = false;
}

function filterByBrand(brand) {
  searchInput.value = "";
  statusSelect.value = "all";
  fuelSelect.value = "all";
  brandSelect.value = brand;
  render();
  document.getElementById("collection").scrollIntoView();
}

/* ---------- dashboard: numbers and gauge ---------- */

const dashboard = { seen: false, ready: false, ran: false, stats: {}, ratio: 0 };

function updateStats() {
  const available = allCars.filter((car) => !isSold(car)).length;
  const brands = new Set(allCars.map((car) => car.brand)).size;

  dashboard.stats = {
    "stat-total": allCars.length,
    "stat-available": available,
    "stat-brands": brands,
    "stat-years": new Date().getFullYear() - FOUNDED_YEAR
  };
  dashboard.ratio = allCars.length ? available / allCars.length : 0;
  dashboard.ready = true;
  dashboard.ran = false;

  runDashboard();
}

// numbers count up and the needle swings, once the data is here and the section is on screen
function runDashboard() {
  if (!dashboard.seen || !dashboard.ready || dashboard.ran) return;
  dashboard.ran = true;

  Object.entries(dashboard.stats).forEach(([id, value]) => {
    countUp(document.getElementById(id), value);
  });

  // needle sweeps from -120deg (empty) to +120deg (all cars ready)
  const angle = -120 + dashboard.ratio * 240;
  document.getElementById("needle").style.transform = "rotate(" + angle + "deg)";
}

function countUp(element, target) {
  if (reduceMotion || target === 0) {
    element.textContent = target;
    return;
  }

  const duration = 1400;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* ---------- filtering and sorting ---------- */

function getVisibleCars() {
  const query = searchInput.value.trim().toLowerCase();
  const brand = brandSelect.value;
  const status = statusSelect.value;
  const fuel = fuelSelect.value;

  const list = allCars.filter((car) => {
    const text = (car.nama + " " + car.brand).toLowerCase();
    const matchesText = text.includes(query);
    const matchesBrand = brand === "all" || car.brand === brand;
    const matchesStatus = status === "all" || car.status === status;
    const matchesFuel = fuel === "all" || car.bahan_bakar === fuel;
    return matchesText && matchesBrand && matchesStatus && matchesFuel;
  });

  switch (sortSelect.value) {
    case "price-low":
      list.sort((a, b) => a.harga - b.harga);
      break;
    case "price-high":
      list.sort((a, b) => b.harga - a.harga);
      break;
    case "year-new":
      list.sort((a, b) => b.tahun - a.tahun);
      break;
    case "name":
      list.sort((a, b) => a.nama.localeCompare(b.nama));
      break;
    default:
      list.sort((a, b) => b.id - a.id);
  }

  return list;
}

function resetFilters() {
  searchInput.value = "";
  brandSelect.value = "all";
  statusSelect.value = "all";
  fuelSelect.value = "all";
  sortSelect.value = "newest";
  render();
}

/* ---------- drawing the cards ---------- */

function buildPhoto(car) {
  const wrapper = make("div", "car-photo");
  const img = document.createElement("img");

  img.src = car.foto;
  img.alt = car.nama;
  img.loading = "lazy";
  img.addEventListener("error", () => {
    img.replaceWith(make("div", "photo-missing", "Photo unavailable"));
  });

  wrapper.appendChild(img);
  return wrapper;
}

function buildCard(car, index) {
  const card = make("article", "car-card" + (isSold(car) ? " is-sold" : ""));
  card.style.animationDelay = (index % 12) * 60 + "ms";

  const photo = buildPhoto(car);
  photo.appendChild(make("span", "tag", translate(statusLabel, car.status)));

  const body = make("div", "car-body");
  body.appendChild(make("p", "car-brand", car.brand));
  body.appendChild(make("h3", "car-name", car.model));

  const meta = make("ul", "car-meta");
  carSpecs(car).forEach((item) => meta.appendChild(make("li", "", item)));
  body.appendChild(meta);

  const footer = make("div", "car-footer");
  footer.appendChild(make("span", "car-price", formatPrice(car.harga)));

  const detailButton = make("button", "link-btn", "View details");
  detailButton.type = "button";
  detailButton.addEventListener("click", () => openDetail(car));
  footer.appendChild(detailButton);
  body.appendChild(footer);

  card.append(photo, body);
  return card;
}

function render() {
  const cars = getVisibleCars();

  grid.innerHTML = "";
  message.hidden = true;

  if (cars.length === 0) {
    resultCount.textContent = "";
    showMessage("We could not find a car matching that. Perhaps try a different search?", "Clear filters", resetFilters);
    return;
  }

  resultCount.textContent = "Showing " + cars.length + " of " + allCars.length + " cars";
  cars.forEach((car, index) => grid.appendChild(buildCard(car, index)));
}

/* ---------- detail popup ---------- */

function openDetail(car) {
  dialogBody.innerHTML = "";

  const content = make("div", "dialog-content" + (isSold(car) ? " is-sold" : ""));
  const photo = buildPhoto(car);
  photo.appendChild(make("span", "tag", translate(statusLabel, car.status)));

  const info = make("div", "dialog-info");
  info.appendChild(make("p", "car-brand", car.brand));
  info.appendChild(make("h3", "", car.model));

  const specs = make("dl", "spec-list");
  const rows = [
    ["Year", car.tahun],
    ["Transmission", translate(gearLabel, car.transmisi)],
    ["Fuel", translate(fuelLabel, car.bahan_bakar)],
    ["Status", translate(statusLabel, car.status)],
    ["Stock no.", "#" + car.id]
  ];

  rows.forEach(([label, value]) => {
    const row = make("div");
    row.append(make("dt", "", label), make("dd", "", value));
    specs.appendChild(row);
  });

  info.append(specs, make("p", "dialog-price", formatPrice(car.harga)));

  const enquire = make("button", "btn btn-primary", isSold(car) ? "Ask for something similar" : "Enquire about this car");
  enquire.type = "button";
  enquire.addEventListener("click", () => {
    dialog.close();
    document.getElementById("message").value =
      "Good day, I would like to know more about the " + car.nama + " (stock no. " + car.id + ").";
    document.getElementById("visit").scrollIntoView();
  });
  info.appendChild(enquire);

  content.append(photo, info);
  dialogBody.appendChild(content);
  dialog.showModal();
}

document.getElementById("dialog-close").addEventListener("click", () => dialog.close());

// clicking the dark area outside the popup closes it
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

/* ---------- page behaviour ---------- */

[searchInput, brandSelect, fuelSelect, statusSelect, sortSelect].forEach((control) => {
  control.addEventListener("input", render);
});

document.getElementById("reset-filters").addEventListener("click", resetFilters);

const navToggle = document.getElementById("nav-toggle");
const mainNav = document.getElementById("main-nav");

navToggle.addEventListener("click", () => {
  const open = mainNav.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", open);
});

mainNav.addEventListener("click", (event) => {
  if (event.target.tagName === "A") {
    mainNav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", false);
  }
});

const header = document.querySelector(".site-header");
const toTop = document.getElementById("to-top");

window.addEventListener("scroll", () => {
  header.classList.toggle("scrolled", window.scrollY > 20);
  toTop.classList.toggle("show", window.scrollY > 600);
});

toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

// highlight the menu link of the section that is on screen
const navLinks = [...mainNav.querySelectorAll("a")];

if ("IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => {
          link.classList.toggle("active", link.getAttribute("href") === "#" + entry.target.id);
        });
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );

  navLinks.forEach((link) => {
    const section = document.querySelector(link.getAttribute("href"));
    if (section) sectionObserver.observe(section);
  });

  // fade elements in as they scroll into view
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

  // start the dashboard when it comes into view
  new IntersectionObserver((entries, observer) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      dashboard.seen = true;
      runDashboard();
      observer.disconnect();
    }
  }, { threshold: 0.3 }).observe(document.getElementById("dash"));
} else {
  // very old browsers: just show everything
  document.querySelectorAll(".reveal").forEach((element) => element.classList.add("visible"));
  dashboard.seen = true;
}

// the contact form is only for show, nothing is sent anywhere
const contactForm = document.getElementById("contact-form");
const formNote = document.getElementById("form-note");

document.getElementById("toolbar").addEventListener("submit", (event) => event.preventDefault());

contactForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.getElementById("name").value.trim();
  formNote.textContent = "Thank you, " + name + ". We will be in touch shortly.";
  formNote.hidden = false;
  contactForm.reset();
});

document.getElementById("year").textContent = new Date().getFullYear();

loadCars();