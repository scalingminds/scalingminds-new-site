document.addEventListener('DOMContentLoaded', () => {

  // Signal that JS is loaded
  document.body.classList.add('js-ready');

  // ========================================
  // 1. SCROLL ANIMATIONS WITH STAGGER
  // ========================================
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        
        // Stagger children with .stagger class
        const children = entry.target.querySelectorAll('.stagger');
        children.forEach((child, i) => {
          child.style.transitionDelay = (i * 0.1) + 's';
          child.classList.add('visible');
        });
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  // ========================================
  // 3. GLASSMORPHISM NAV
  // ========================================
  const nav = document.querySelector('.nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      const scrolled = window.pageYOffset > 50;
      nav.classList.toggle('scrolled', scrolled);
      nav.classList.toggle('nav--glass', scrolled);
    });
  }

  // ========================================
  // MOBILE MENU
  // ========================================
  const toggle = document.querySelector('.nav__toggle');
  const links = document.querySelector('.nav__links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('open');
    });
    links.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => links.classList.remove('open'));
    });
  }

  // ========================================
  // 4. ANIMATED NUMBER COUNTERS
  // ========================================
  const counters = document.querySelectorAll('[data-count]');
  if (counters.length) {
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !entry.target.classList.contains('counted')) {
          entry.target.classList.add('counted');
          const target = parseInt(entry.target.dataset.count);
          const suffix = entry.target.dataset.suffix || '';
          const duration = 2000;
          const start = performance.now();
          
          const animate = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(eased * target);
            entry.target.textContent = current + suffix;
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      });
    }, { threshold: 0.5 });
    
    counters.forEach(el => counterObserver.observe(el));
  }

  // ========================================
  // 5. TEXT HIGHLIGHT ANIMATION
  // ========================================
  const highlights = document.querySelectorAll('.highlight-draw');
  if (highlights.length) {
    const highlightObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('drawn');
        }
      });
    }, { threshold: 0.5 });
    
    highlights.forEach(el => highlightObserver.observe(el));
  }

  // ========================================
  // 6. CURSOR-RESPONSIVE HEX HOVER (TILT)
  // ========================================
  document.querySelectorAll('.hex-tilt').forEach(el => {
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = 'perspective(400px) rotateY(' + (x * 12) + 'deg) rotateX(' + (-y * 12) + 'deg) scale(1.05)';
    });
    el.addEventListener('mouseleave', () => {
      el.style.transform = 'perspective(400px) rotateY(0) rotateX(0) scale(1)';
    });
  });

  // ========================================
  // 7. SMOOTH PAGE TRANSITIONS
  // ========================================
  const wrapper = document.querySelector('.page-transition');
  if (wrapper) {
    wrapper.classList.add('page-loaded');
    
    document.querySelectorAll('a[href^="/"]').forEach(link => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (href && !link.getAttribute('target')) {
          e.preventDefault();
          wrapper.classList.remove('page-loaded');
          wrapper.classList.add('page-leaving');
          setTimeout(() => {
            window.location.href = href;
          }, 300);
        }
      });
    });
  }

  // ========================================
  // LOGO TICKER PAUSE
  // ========================================
  const ticker = document.querySelector('.logo-ticker__scroll');
  if (ticker) {
    ticker.addEventListener('mouseenter', () => ticker.style.animationPlayState = 'paused');
    ticker.addEventListener('mouseleave', () => ticker.style.animationPlayState = 'running');
  }

});
