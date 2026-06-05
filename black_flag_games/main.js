document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.getElementById('navbar');
  const progress = document.getElementById('progress');
  const backTop = document.getElementById('back-top');
  const hamburger = document.getElementById('hamburger');
  const navMobile = document.getElementById('nav-mobile');
  const searchInput = document.getElementById('search');
  const cards = document.querySelectorAll('.game-card');
  const noResults = document.getElementById('no-results');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const reveals = document.querySelectorAll('.reveal');
  const stats = document.querySelectorAll('.stat-num[data-count]');
  const navLinks = document.querySelectorAll('.nav-links a');
  const toast = document.getElementById('toast');

  function updateProgress() {
    if (!progress) return;
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
    progress.style.width = `${pct}%`;
  }

  function updateNavState() {
    const scrolled = window.scrollY > 40;
    if (navbar) navbar.classList.toggle('scrolled', scrolled);
    if (backTop) backTop.classList.toggle('visible', window.scrollY > 400);
  }

  function closeMobile() {
    if (!hamburger || !navMobile) return;
    hamburger.classList.remove('open');
    navMobile.classList.remove('open');
  }

  window.closeMobile = closeMobile;

  window.addEventListener('scroll', () => {
    updateProgress();
    updateNavState();
  });

  updateProgress();
  updateNavState();

  if (hamburger && navMobile) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('open');
      navMobile.classList.toggle('open');
    });
  }

  if (backTop) {
    backTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.1 });

    reveals.forEach((el) => revealObserver.observe(el));

    const statObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.5 });

    stats.forEach((el) => statObserver.observe(el));

    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || !entry.target.id) return;
        navLinks.forEach((a) => a.classList.remove('active'));
        const active = document.querySelector(`.nav-links a[href="#${entry.target.id}"]`);
        if (active) active.classList.add('active');
      });
    }, { threshold: 0.4 });

    const tracked = document.querySelectorAll('section[id], div[id]');
    tracked.forEach((el) => sectionObserver.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('visible'));
    stats.forEach((el) => animateCount(el));
  }

  function animateCount(el) {
    const target = Number(el.dataset.count || 0);
    const duration = 1200;
    const start = performance.now();

    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(ease * target));
      if (t < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  let activeFilter = 'all';

  function filterCards() {
    if (!searchInput || !cards.length) return;

    const q = searchInput.value.toLowerCase().trim();
    let visible = 0;

    cards.forEach((card) => {
      const title = (card.querySelector('.game-title')?.textContent || '').toLowerCase();
      const desc = (card.querySelector('.game-desc')?.textContent || '').toLowerCase();
      const tags = (card.dataset.tags || '').toLowerCase();

      const matchSearch = !q || title.includes(q) || desc.includes(q);
      const matchFilter = activeFilter === 'all' || tags.includes(activeFilter);
      const show = matchSearch && matchFilter;

      card.classList.toggle('hidden', !show);
      if (show) visible += 1;
    });

    if (noResults) {
      noResults.style.display = visible === 0 ? 'block' : 'none';
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', filterCards);
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter || 'all';
      filterCards();
    });
  });

  let toastShown = false;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => {
      toast.classList.remove('show');
    }, 2600);
  }

  document.querySelectorAll('.access-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!toastShown) {
        toastShown = true;
        showToast('Opening title in a new tab...');
      }
    });
  });

  filterCards();
});