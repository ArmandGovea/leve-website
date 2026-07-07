/* ============================================================
   LEVÉ NAIL BAR — index.js
   Includes: Firebase Firestore · Custom Calendar · EmailJS
   ============================================================

   ── SETUP CHECKLIST ──────────────────────────────────────────

   1. FIREBASE
      a) Go to https://console.firebase.google.com
      b) Create a project → Firestore Database → Start in test mode
      c) Project Settings → Web app → copy firebaseConfig values
      d) Paste them into the FIREBASE CONFIG block below

   2. EMAILJS  (sends booking email to levebeautybar@gmail.com)
      a) Go to https://www.emailjs.com and create a free account
      b) Add a Service: connect your Gmail (levebeautybar@gmail.com)
         → copy the Service ID
      c) Create a Template. In the template body use these variables:
            {{client_name}}  {{client_email}}  {{client_phone}}
            {{booking_date}} {{booking_time}}  {{category}}
            {{service}}      {{how_heard}}     {{notes}}
            {{location_requested}}
         Set "To email" to levebeautybar@gmail.com
         → copy the Template ID
      d) Account → API Keys → copy your Public Key
      e) Paste all three into the EMAILJS CONFIG block below

   ─────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

  /* ══════════════════════════════════════════
     CONFIG VALIDATION
     Load from config.js (see config.example.js)
     ══════════════════════════════════════════ */
  if (!window.config) {
    console.error('❌ Configuration Error: config.js not found. Copy config.example.js to config.js and fill in your API keys.');
    alert('Configuration Error: Please set up config.js');
    return;
  }

  const firebaseConfig = window.config.firebase;
  const EMAILJS_PUBLIC_KEY  = window.config.emailjs.publicKey;
  const EMAILJS_SERVICE_ID  = window.config.emailjs.serviceId;
  const EMAILJS_TEMPLATE_ID = window.config.emailjs.templateId;
  const BOOKING_EMAIL       = window.config.emailjs.bookingEmail;

  /* ── Max bookings per day before "Fully Booked" ── */
  const MAX_PER_DAY = 4;

  /* ── How many months ahead can clients book? ── */
  const MONTHS_AHEAD = 3;

  /* ══════════════════════════════════════════
     INITIALISE FIREBASE & EMAILJS
     ══════════════════════════════════════════ */
  let db = null;
  const firebaseReady = firebaseConfig.apiKey !== 'YOUR_API_KEY';

  if (firebaseReady) {
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
    } catch (e) {
      console.warn('Firebase init failed:', e);
    }
  }

  if (window.emailjs && EMAILJS_PUBLIC_KEY) {
    window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  }

  /* ══════════════════════════════════════════
     GALLERY — auto-scrolling photo strip
     ══════════════════════════════════════════
     Add your photo filenames below. Place the actual image files in
     an "images/gallery/" folder next to index.html (see setup notes
     at the top of this file / the chat instructions for details). */
  const GALLERY_IMAGES = [
    'images/gallery/gallery-1.jpeg',
    'images/gallery/gallery-2.jpeg',
    'images/gallery/gallery-3.jpeg',
    'images/gallery/gallery-4.jpeg',
    'images/gallery/gallery-5.jpeg',
    'images/gallery/gallery-6.jpeg',
    'images/gallery/gallery-7.jpeg',
  ];

  const galleryTrack = document.getElementById('galleryTrack');
  if (galleryTrack && GALLERY_IMAGES.length) {
    /* Render the list twice back-to-back so the CSS marquee animation
       (translateX 0 → -50%) loops seamlessly with no visible jump. */
    const slidesHtml = GALLERY_IMAGES.map(src =>
      `<div class="gallery__slide"><img src="${src}" alt="Levé Nail Bar gallery photo" loading="lazy" /></div>`
    ).join('');
    galleryTrack.innerHTML = slidesHtml + slidesHtml;
  }

  /* ══════════════════════════════════════════
     NAV — sticky + burger
     ══════════════════════════════════════════ */
  const navbar    = document.getElementById('navbar');
  const burgerBtn = document.getElementById('burgerBtn');
  const navLinks  = document.getElementById('navLinks');

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  });

  burgerBtn.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    burgerBtn.classList.toggle('open', open);
    burgerBtn.setAttribute('aria-expanded', open);
  });

  navLinks.querySelectorAll('.nav__link').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      burgerBtn.classList.remove('open');
    });
  });

  /* ══════════════════════════════════════════
     SCROLL REVEAL
     ══════════════════════════════════════════ */
  const revealEls = document.querySelectorAll(
    '.about__grid, .service-card, .contact__info, .contact__detail, .stat'
  );
  revealEls.forEach(el => el.classList.add('reveal'));

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 80);
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  revealEls.forEach(el => revealObserver.observe(el));

  /* ══════════════════════════════════════════
     CALENDAR
     ══════════════════════════════════════════ */
  const calGrid       = document.getElementById('calGrid');
  const calMonthTitle = document.getElementById('calMonthTitle');
  const calPrev       = document.getElementById('calPrev');
  const calNext       = document.getElementById('calNext');
  const calLoading    = document.getElementById('calLoading');
  const selectedDateInput = document.getElementById('selectedDate');
  const calChosen     = document.getElementById('calChosen');
  const timeSelect    = document.getElementById('time');

  /* Cache: dateKey (YYYY-MM-DD) → booking count */
  const bookingCache = {};

  /* Cache: dateKey (YYYY-MM-DD) → array of booked time strings ('HH:MM') */
  const bookingTimesCache = {};

  /* Current calendar view month */
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let calYear  = today.getFullYear();
  let calMonth = today.getMonth(); // 0-based

  /* Furthest selectable month */
  const maxDate = new Date(today.getFullYear(), today.getMonth() + MONTHS_AHEAD, 1);

  /* How long a single appointment occupies the booked time slot.
     The next booking can't start until this many minutes after a
     prior booking's start time on the same day. */
  const APPOINTMENT_BLOCK_MINUTES = 120;

  /* Time slots — matches the hours shown in the Contact section.
     Last slot is kept early enough that a 2-hour appointment still
     finishes before closing time. */
  const weekdaySlots = [
    '08:00','08:30','09:00','09:30','10:00','10:30',
    '11:00','11:30','12:00','12:30','13:00','13:30',
    '14:00','14:30','15:00','15:30','16:00','16:30',
    '17:00','17:30','18:00'
  ]; // Mon–Fri: 8am – 8pm
  const saturdaySlots = [
    '09:00','09:30','10:00','10:30','11:00','11:30',
    '12:00','12:30','13:00','13:30','14:00','14:30',
    '15:00','15:30','16:00','16:30','17:00','17:30','18:00'
  ]; // Saturday: 9am – 8pm
  const sundaySlots = [
    '10:00','10:30','11:00','11:30','12:00','12:30',
    '13:00','13:30','14:00','14:30','15:00','15:30','16:00'
  ]; // Sunday: 10am – 6pm

  function timeToMinutes(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  /* Fetch all booking counts + times for a given month from Firestore */
  async function fetchMonthCounts(year, month) {
    if (!db) return;

    /* date keys for this month: YYYY-MM-01 … YYYY-MM-31 */
    const firstDay = `${year}-${String(month + 1).padStart(2,'0')}-01`;
    const lastDay  = `${year}-${String(month + 1).padStart(2,'0')}-31`;

    for (const key of Object.keys(bookingCache)) {
      if (key >= firstDay && key <= lastDay) delete bookingCache[key];
    }
    for (const key of Object.keys(bookingTimesCache)) {
      if (key >= firstDay && key <= lastDay) delete bookingTimesCache[key];
    }

    calLoading.classList.remove('hidden');
    try {
      const snap = await db.collection('bookings')
        .where('date', '>=', firstDay)
        .where('date', '<=', lastDay)
        .get();

      /* Reset month counts in cache */
      snap.forEach(doc => {
        const data = doc.data();
        const d = data.date;
        if (!d) return;
        bookingCache[d] = (bookingCache[d] || 0) + 1;
        if (data.time) {
          if (!bookingTimesCache[d]) bookingTimesCache[d] = [];
          bookingTimesCache[d].push(data.time);
        }
      });
    } catch (e) {
      console.warn('Firestore read failed:', e);
    } finally {
      calLoading.classList.add('hidden');
    }
  }

  /* Render the calendar grid */
  async function renderCalendar(year, month) {
    await fetchMonthCounts(year, month);

    /* Month label */
    const monthNames = ['January','February','March','April','May','June',
      'July','August','September','October','November','December'];
    calMonthTitle.textContent = `${monthNames[month]} ${year}`;

    /* Nav button states */
    const viewingDate = new Date(year, month, 1);
    calPrev.disabled = viewingDate <= new Date(today.getFullYear(), today.getMonth(), 1);
    calNext.disabled = viewingDate >= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

    /* Build grid */
    calGrid.innerHTML = '';
    const firstWeekday = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth  = new Date(year, month + 1, 0).getDate();

    /* Empty cells before first day */
    for (let i = 0; i < firstWeekday; i++) {
      const blank = document.createElement('div');
      blank.className = 'cal-cell cal-cell--empty';
      calGrid.appendChild(blank);
    }

    /* Day cells */
    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(year, month, d);
      const dateKey  = toDateKey(cellDate);
      const dayOfWeek = cellDate.getDay(); // 0=Sun, 6=Sat

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.textContent = d;
      cell.dataset.date = dateKey;

      const isPast    = cellDate < today;
      const isSelected = selectedDateInput.value === dateKey;
      const count = bookingCache[dateKey] || 0;
      const isFull = count >= MAX_PER_DAY;

      cell.className = 'cal-cell';

      if (isPast) {
        cell.className += ' cal-cell--disabled';
        cell.disabled = true;
      } else if (isFull) {
        cell.className += ' cal-cell--full';
        cell.disabled = true;
      } else if (count >= MAX_PER_DAY - 1) {
        cell.className += ' cal-cell--filling';
      } else if (count > 0) {
        cell.className += ' cal-cell--booked';
      } else {
        cell.className += ' cal-cell--open';
      }

      if (isSelected) cell.classList.add('cal-cell--selected');
      if (dateKey === toDateKey(today)) cell.classList.add('cal-cell--today');

      if (!cell.disabled) {
        cell.addEventListener('click', () => selectDate(dateKey, dayOfWeek));
      }

      calGrid.appendChild(cell);
    }
  }

  function toDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  function selectDate(dateKey, dayOfWeek) {
    selectedDateInput.value = dateKey;

    /* Update selected highlight */
    calGrid.querySelectorAll('.cal-cell--selected').forEach(c => c.classList.remove('cal-cell--selected'));
    const cell = calGrid.querySelector(`[data-date="${dateKey}"]`);
    if (cell) cell.classList.add('cal-cell--selected');

    /* Show human-readable label */
    const [y, m, d] = dateKey.split('-').map(Number);
    const display = new Date(y, m - 1, d).toLocaleDateString('en-ZA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    calChosen.textContent = `Selected: ${display}`;

    /* Populate times */
    const slots = dayOfWeek === 0 ? sundaySlots : dayOfWeek === 6 ? saturdaySlots : weekdaySlots;
    populateTimes(slots, dateKey);
  }

  function populateTimes(slots, dateKey) {
    const bookedTimes = bookingTimesCache[dateKey] || [];
    const bookedMinutes = bookedTimes.map(timeToMinutes);

    /* A slot is blocked if it falls on, or within APPOINTMENT_BLOCK_MINUTES
       after, an existing booking's start time on the same day. */
    const availableSlots = slots.filter(t => {
      const tMin = timeToMinutes(t);
      return !bookedMinutes.some(bMin => {
        const diff = tMin - bMin;
        return diff >= 0 && diff < APPOINTMENT_BLOCK_MINUTES;
      });
    });

    timeSelect.innerHTML = '<option value="">Select a time…</option>';

    if (!availableSlots.length) {
      timeSelect.innerHTML = '<option value="">No times available this day</option>';
      timeSelect.disabled = true;
      return;
    }

    availableSlots.forEach(t => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = t;
      timeSelect.appendChild(opt);
    });
    timeSelect.disabled = false;
  }

  /* Month navigation */
  calPrev.addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar(calYear, calMonth);
  });
  calNext.addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar(calYear, calMonth);
  });

  /* Initial render */
  renderCalendar(calYear, calMonth);

  /* ══════════════════════════════════════════
     MULTI-STEP FORM
     ══════════════════════════════════════════ */
  const steps = {
    panels: [
      document.getElementById('step1'),
      document.getElementById('step2'),
      document.getElementById('step3'),
      document.getElementById('stepSuccess'),
    ],
    indicators: document.querySelectorAll('.form-step'),
    current: 0,
  };

  const bookingFormEl = document.getElementById('bookingForm');

  function scrollToFormTop() {
    const offset = window.innerWidth < 768 ? 70 : 90;
    const top = bookingFormEl.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  function goTo(index) {
    const previous = steps.current;

    steps.panels.forEach(p => p.classList.remove('active'));
    steps.panels[index].classList.add('active');
    steps.current = index;
    steps.indicators.forEach((ind, i) => {
      ind.classList.remove('active', 'done');
      if (i < index) ind.classList.add('done');
      else if (i === index) ind.classList.add('active');
    });

    if (index > previous) {
      requestAnimationFrame(scrollToFormTop);
    }
  }

  document.getElementById('toStep2').addEventListener('click', () => {
    if (!validateStep1()) return;
    goTo(1);
  });
  document.getElementById('backToStep1').addEventListener('click', () => goTo(0));
  document.getElementById('toStep3').addEventListener('click', () => {
    if (!validateStep2()) return;
    buildSummary();
    goTo(2);
  });
  document.getElementById('backToStep2').addEventListener('click', () => goTo(1));

  document.getElementById('submitBooking').addEventListener('click', async () => {
    const btn = document.getElementById('submitBooking');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      await withTimeout(saveBookingToFirestore(), 12000, 'Saving booking timed out.');

      try {
        await withTimeout(sendBookingEmail(), 12000, 'Sending email timed out.');
      } catch (emailErr) {
        console.warn('Email send failed or timed out:', emailErr);
      }

      goTo(3);
      /* Re-render calendar so new booking count shows */
      renderCalendar(calYear, calMonth);
    } catch (err) {
      console.error(err);
      alert('Something went wrong. Please try again or contact us directly.');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  });

  document.getElementById('resetForm').addEventListener('click', () => {
    document.getElementById('bookingForm')
      .querySelectorAll('input, select, textarea')
      .forEach(el => {
        if (el.type === 'radio') el.checked = false;
        else el.value = '';
      });

    timeSelect.innerHTML = '<option value="">Select a date first…</option>';
    timeSelect.disabled = true;
    calChosen.textContent = '';
    document.getElementById('needLocation').checked = false;
    switchCategory('brows');
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.cat-tab[data-cat="brows"]').classList.add('active');
    goTo(0);
  });

  /* ══════════════════════════════════════════
     VALIDATION
     ══════════════════════════════════════════ */
  function validateStep1() {
    const name  = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const date  = document.getElementById('selectedDate').value;
    const time  = document.getElementById('time').value;

    if (!name)  { flashInput('fullName', 'Please enter your name'); return false; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      flashInput('email', 'Please enter a valid email'); return false;
    }
    if (!phone) { flashInput('phone', 'Please enter your phone number'); return false; }
    if (!date)  { alert('Please select a date on the calendar.'); return false; }
    if (!time)  { flashInput('time', 'Please select a time'); return false; }
    return true;
  }

  function validateStep2() {
    const activeTab = document.querySelector('.cat-tab.active').dataset.cat;
    const nameMap = { brows: 'browsService', nails: 'nailsService', lashes: 'lashesService' };
    const selected = document.querySelector(`input[name="${nameMap[activeTab]}"]:checked`);
    if (!selected) { alert('Please select a service before continuing.'); return false; }
    return true;
  }

  function flashInput(id, msg) {
    const el = document.getElementById(id);
    el.style.borderColor = '#c0392b';
    el.setAttribute('placeholder', msg);
    el.focus();
    setTimeout(() => { el.style.borderColor = ''; }, 2500);
  }

  /* ══════════════════════════════════════════
     CATEGORY TABS
     ══════════════════════════════════════════ */
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      switchCategory(tab.dataset.cat);
    });
  });

  function switchCategory(cat) {
    document.querySelectorAll('.cat-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('cat-' + cat);
    if (panel) panel.classList.add('active');
  }

  /* ══════════════════════════════════════════
     BOOKING DATA
     ══════════════════════════════════════════ */
  function getBookingData() {
    const name     = document.getElementById('fullName').value.trim();
    const email    = document.getElementById('email').value.trim();
    const phone    = document.getElementById('phone').value.trim();
    const date     = document.getElementById('selectedDate').value;
    const time     = document.getElementById('time').value;
    const notes    = document.getElementById('notes').value.trim();
    const howHeard = document.getElementById('howHeard')?.value || 'Not specified';
    const needLocation = document.getElementById('needLocation')?.checked || false;

    const activeTab = document.querySelector('.cat-tab.active').dataset.cat;
    const nameMap   = { brows: 'browsService', nails: 'nailsService', lashes: 'lashesService' };
    const selectedService = document.querySelector(`input[name="${nameMap[activeTab]}"]:checked`)?.value || '—';

    const [y, m, d] = date.split('-').map(Number);
    const dateDisplay = new Date(y, m - 1, d).toLocaleDateString('en-ZA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    return {
      name, email, phone, date, dateDisplay, time,
      category: capitalize(activeTab),
      service:  selectedService,
      notes:    notes || 'None',
      howHeard,
      needLocation,
      locationText: needLocation ? 'Yes — please send the studio location' : 'No',
    };
  }

  function buildSummary() {
    const b = getBookingData();
    const rows = [
      { label: 'Name',     value: b.name },
      { label: 'Email',    value: b.email },
      { label: 'Phone',    value: b.phone },
      { label: 'Date',     value: b.dateDisplay },
      { label: 'Time',     value: b.time },
      { label: 'Category', value: b.category },
      { label: 'Service',  value: b.service },
      { label: 'Location', value: b.locationText },
    ];
    if (b.notes !== 'None') rows.push({ label: 'Notes', value: b.notes });

    document.getElementById('bookingSummary').innerHTML = rows.map(r => `
      <div class="summary-row">
        <strong>${r.label}</strong>
        <span>${r.value}</span>
      </div>`).join('');
  }

  function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

  function withTimeout(promise, timeoutMs, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  }

  /* ══════════════════════════════════════════
     FIRESTORE — save booking
     ══════════════════════════════════════════ */
  async function saveBookingToFirestore() {
    if (!db) return; /* silently skip if Firebase not configured */

    const b = getBookingData();
    await db.collection('bookings').add({
      name:      b.name,
      email:     b.email,
      phone:     b.phone,
      date:      b.date,       /* YYYY-MM-DD — used for calendar queries */
      time:      b.time,
      category:  b.category,
      service:   b.service,
      notes:     b.notes,
      howHeard:  b.howHeard,
      needLocation: b.needLocation,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    /* Update local cache immediately */
    bookingCache[b.date] = (bookingCache[b.date] || 0) + 1;
    if (!bookingTimesCache[b.date]) bookingTimesCache[b.date] = [];
    bookingTimesCache[b.date].push(b.time);
  }

  /* ══════════════════════════════════════════
     EMAILJS — send booking email
     ══════════════════════════════════════════ */
  function buildEmailText(b) {
    return [
      'New Booking Request — Levé Nail Bar',
      '',
      `Client Name : ${b.name}`,
      `Email       : ${b.email}`,
      `Phone       : ${b.phone}`,
      `Date        : ${b.dateDisplay}`,
      `Time        : ${b.time}`,
      `Category    : ${b.category}`,
      `Service     : ${b.service}`,
      `Location    : ${b.locationText}`,
      `How Heard   : ${b.howHeard}`,
      `Notes       : ${b.notes}`,
    ].join('\n');
  }

  function buildEmailHtml(b) {
    const row = (label, val) =>
      `<tr><td style="padding:8px 12px;border:1px solid #ddd;font-weight:600;background:#faf6f0;width:140px">${label}</td>` +
      `<td style="padding:8px 12px;border:1px solid #ddd;">${val}</td></tr>`;

    return `
<div style="font-family:'Jost',Arial,sans-serif;color:#111;max-width:640px;margin:0 auto;">
  <div style="background:#111010;padding:24px 32px;">
    <h1 style="color:#f5efe6;font-family:Georgia,serif;font-weight:300;margin:0;font-size:28px;letter-spacing:4px;">Levé</h1>
  </div>
  <div style="padding:32px;">
    <h2 style="margin:0 0 8px;font-size:20px;">New Booking Request</h2>
    <p style="color:#6b6057;margin:0 0 24px;font-size:14px;">A new appointment request was submitted via the Levé website.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${row('Client Name', b.name)}
      ${row('Email', b.email)}
      ${row('Phone', b.phone)}
      ${row('Date', b.dateDisplay)}
      ${row('Time', b.time)}
      ${row('Category', b.category)}
      ${row('Service', b.service)}
      ${row('Location Requested', b.locationText)}
      ${row('How They Heard', b.howHeard)}
      ${row('Notes', b.notes)}
    </table>
    <p style="margin-top:24px;font-size:13px;color:#6b6057;">
      Reply directly to this email to contact the client at <a href="mailto:${b.email}">${b.email}</a>.
    </p>
  </div>
  <div style="background:#f5efe6;padding:16px 32px;font-size:12px;color:#8b6f47;text-align:center;">
    © 2025 Levé Beauty Studio
  </div>
</div>`;
  }

  async function sendBookingEmail() {
    const b = getBookingData();
    const subject = `New Booking: ${b.name} — ${b.dateDisplay} at ${b.time}`;

    const ejsReady = Boolean(EMAILJS_PUBLIC_KEY && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && window.emailjs);

    if (ejsReady) {
      await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email:     BOOKING_EMAIL,
        reply_to:     b.email,
        subject,
        message:      buildEmailText(b),
        message_html: buildEmailHtml(b),
        /* Individual vars for use in EmailJS template */
        client_name:  b.name,
        client_email: b.email,
        client_phone: b.phone,
        booking_date: b.dateDisplay,
        booking_time: b.time,
        category:     b.category,
        service:      b.service,
        how_heard:    b.howHeard,
        notes:        b.notes,
        location_requested: b.locationText,
      });
      return;
    }

    /* Fallback: open mailto if EmailJS not configured yet */
    const mailto = `mailto:${BOOKING_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildEmailText(b))}`;
    window.location.href = mailto;
  }

  /* ══════════════════════════════════════════
     SMOOTH SCROLL
     ══════════════════════════════════════════ */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const offset = target.getBoundingClientRect().top + window.scrollY - (window.innerWidth < 768 ? 60 : 80);
      window.scrollTo({ top: offset, behavior: 'smooth' });
    });
  });

  /* ══════════════════════════════════════════
     ACTIVE NAV LINK on scroll
     ══════════════════════════════════════════ */
  const sections   = document.querySelectorAll('section[id]');
  const navLinkEls = document.querySelectorAll('.nav__link');

  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinkEls.forEach(l => l.classList.remove('active-link'));
        const a = document.querySelector(`.nav__link[href="#${entry.target.id}"]`);
        if (a) a.classList.add('active-link');
      }
    });
  }, { threshold: 0.4 });

  sections.forEach(s => sectionObserver.observe(s));

}); // end DOMContentLoaded