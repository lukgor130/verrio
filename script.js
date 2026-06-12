const header = document.querySelector("[data-header]");
const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".site-nav");
const navLinks = [...document.querySelectorAll(".site-nav a[href^='#']")];
const revealItems = [...document.querySelectorAll("[data-reveal]")];
const contactForm = document.querySelector("[data-contact-form]");

document.querySelector("[data-year]").textContent = new Date().getFullYear();

menuButton?.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  navigation.classList.toggle("is-open", !isOpen);
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    menuButton?.setAttribute("aria-expanded", "false");
    navigation.classList.remove("is-open");
  });
});

const updateHeader = () => {
  const currentScroll = window.scrollY;
  header.classList.remove("is-hidden");
  header.classList.toggle("is-fixed", currentScroll > 30);
};

let ticking = false;
window.addEventListener("scroll", () => {
  if (ticking) return;
  window.requestAnimationFrame(() => {
    updateHeader();
    ticking = false;
  });
  ticking = true;
}, { passive: true });

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("is-visible");
    observer.unobserve(entry.target);
  });
}, { threshold: 0.18 });

revealItems.forEach((item) => revealObserver.observe(item));

const sections = [...document.querySelectorAll("main section[id]")];
const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

  if (!visible) return;
  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("href") === `#${visible.target.id}`);
  });
}, { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.2, 0.5] });

sections.forEach((section) => sectionObserver.observe(section));

contactForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!contactForm.reportValidity()) return;

  const formData = new FormData(contactForm);
  const organisation = formData.get("organisation");
  const interest = formData.get("interest");
  const subject = `${interest} enquiry from ${organisation}`;
  const body = [
    `Name: ${formData.get("name")}`,
    `Organisation: ${organisation}`,
    `Work email: ${formData.get("email")}`,
    `Area of interest: ${interest}`,
    "",
    formData.get("message"),
  ].join("\n");

  window.location.href = `mailto:info@verrio.co?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});

updateHeader();
